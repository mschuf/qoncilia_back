import { BadRequestException } from "@nestjs/common"
import * as XLSX from "xlsx"
import type { SapTarjetasCsvParseResult } from "./sap-tarjetas-csv.util"

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]/g, "")
  .toLowerCase()

const text = (value: unknown) => String(value ?? "").trim()

function parseAmount(value: unknown): number {
  const raw = text(value).replace(/\s/g, "")
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw
  const result = Number(normalized)
  if (!raw || !Number.isFinite(result) || result < 0) {
    throw new BadRequestException(`Monto Dinelco invalido: ${raw || "vacio"}.`)
  }
  return result
}

function dinelcoDate(value: unknown, field: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text(value))
  if (!match) throw new BadRequestException(`${field} Dinelco invalida: ${text(value)}.`)
  const [, day, month, year] = match
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new BadRequestException(`${field} Dinelco invalida: ${text(value)}.`)
  }
  return iso
}

export function parseDinelcoTarjetas(buffer: Buffer): SapTarjetasCsvParseResult {
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
  const isOle = buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
  if (!isZip && !isOle) throw new BadRequestException("El archivo Dinelco debe ser .xls o .xlsx.")
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false })
  } catch {
    throw new BadRequestException("El archivo Dinelco debe ser un Excel valido.")
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const matrix = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, blankrows: false, defval: "" })
    : []
  if (matrix.length < 2) throw new BadRequestException("El Excel Dinelco no contiene operaciones.")

  const header = matrix[0].map(normalize)
  const field = (name: string) => {
    const index = header.indexOf(normalize(name))
    if (index < 0) throw new BadRequestException(`Falta la columna Dinelco: ${name}.`)
    return index
  }
  const dateIndex = field("Fecha Acreditación")
  const saleDateIndex = field("Fecha Venta")
  const branchIndex = field("Nombre Sucursal")
  const branchCodeIndex = field("Cód. Sucursal")
  const referenceIndex = field("Cód. de Autorización")
  const typeIndex = field("Tipo de Tarjeta")
  const presentationIndex = header.includes(normalize("Prestación"))
    ? field("Prestación")
    : field("Presentación")
  const grossAmountIndex = field("Monto")
  const amountIndex = field("Monto Neto")
  const stateIndex = field("Estado")
  const columns = ["Referencia", "Fecha", "Importe", "Fecha Venta", "Fecha Acreditación", "Monto", "Monto Neto", "Nombre Sucursal", "Cód. Sucursal", "Prestación", "Tipo de tarjeta", "Estado"]
  const rows: Record<string, unknown>[] = []
  let totalRows = 0

  for (const row of matrix.slice(1)) {
    if (!row.some((cell) => text(cell))) continue
    totalRows += 1
    // A = aprobada; R y X no representan ventas depositables.
    if (normalize(row[stateIndex]) !== "a") continue
    const branch = text(row[branchIndex])
    const branchCode = text(row[branchCodeIndex])
    const reference = text(row[referenceIndex])
    const cardType = text(row[typeIndex])
    if (!branch || !branchCode || !reference || !cardType) {
      throw new BadRequestException(`Fila ${totalRows + 1} de Dinelco: faltan sucursal, referencia o tipo de tarjeta valido.`)
    }
    const neto = parseAmount(row[amountIndex])
    // Las ventas pendientes todavia no tienen importe neto depositable.
    if (neto === 0) continue
    const presentation = text(row[presentationIndex])
    if (!presentation) {
      throw new BadRequestException(`Fila ${totalRows + 1} de Dinelco: falta Prestación.`)
    }
    const bruto = parseAmount(row[grossAmountIndex])
    if (bruto < neto) {
      throw new BadRequestException(`Fila ${totalRows + 1} de Dinelco: Monto Neto supera Monto.`)
    }
    const fechaAcreditacion = dinelcoDate(row[dateIndex], "Fecha Acreditacion")
    const fechaVenta = dinelcoDate(row[saleDateIndex], "Fecha Venta")
    rows.push({
      Referencia: reference,
      Fecha: fechaVenta,
      Importe: bruto,
      "Fecha Venta": fechaVenta,
      "Fecha Acreditación": fechaAcreditacion,
      Monto: bruto,
      "Monto Neto": neto,
      "Nombre Sucursal": branch,
      "Cód. Sucursal": branchCode,
      "Prestación": presentation,
      "Tipo de tarjeta": cardType,
      Estado: "A"
    })
  }
  return { columns, rows, totalRows }
}
