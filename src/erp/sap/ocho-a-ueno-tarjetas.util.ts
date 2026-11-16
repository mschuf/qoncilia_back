import { BadRequestException } from "@nestjs/common"
import * as XLSX from "xlsx"
import type { SapTarjetasCsvParseResult } from "./sap-tarjetas-csv.util"

// Parser exclusivo del Excel "Transacciones_Liquidaciones" de UENO para OCHO_A.
// Las columnas Referencia/Fecha/Importe son alias internos del matching contra
// OCRH: Codigo de autorizacion, Fecha de venta e importe bruto.

export const UENO_QR_CARD_TYPE = "QR"

export const UENO_COLUMNS = {
  authorization: "Código de autorización",
  saleDate: "Fecha de venta",
  grossAmount: "Monto bruto",
  netAmount: "Monto neto",
  commission: "Comisión total",
  cardType: "Tipo de tarjeta",
  accreditationDate: "Fecha de Acreditación",
  paymentVoucher: "Nro. de comprobante de pago",
  brand: "Marca",
  cardNumber: "Número de tarjeta",
  ticket: "Boleta N°",
  paymentState: "Estado de pago"
} as const

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/[^a-zA-Z0-9]/g, "")
  .toLowerCase()

const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

function isoDate(year: number, month: number, day: number): string | null {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso
}

// Acepta 13-03-2026, 13/03/2026, 2026-03-16T00:00:00 o una fecha serial de Excel.
function parseUenoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? isoDate(parsed.y, parsed.m, parsed.d) : null
  }
  const raw = text(value)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(raw)
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s.*)?$/.exec(raw)
  if (dayFirst) return isoDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]))
  return null
}

function parseUenoAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const raw = text(value).replace(/\s/g, "")
  if (!raw || !/^[-+]?\d[\d.,]*$/.test(raw)) return null
  const sign = raw.startsWith("-") ? "-" : ""
  const unsigned = raw.replace(/^[-+]/, "")
  const lastDot = unsigned.lastIndexOf(".")
  const lastComma = unsigned.lastIndexOf(",")
  let normalized = unsigned
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ","
    const thousands = decimal === "." ? "," : "."
    normalized = unsigned.split(thousands).join("").replace(decimal, ".")
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ","
    const groups = unsigned.split(separator)
    normalized = groups.length > 1 && groups.slice(1).every((group) => group.length === 3)
      ? groups.join("")
      : unsigned.replace(separator, ".")
  }
  const result = Number(`${sign}${normalized}`)
  return Number.isFinite(result) ? result : null
}

// "Tipo de tarjeta" vacio corresponde a cobros QR.
export function resolveUenoCardType(value: unknown): string {
  return text(value) || UENO_QR_CARD_TYPE
}

export function parseOchoAUenoTarjetas(buffer: Buffer): SapTarjetasCsvParseResult {
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
  const isOle = buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf &&
    buffer[2] === 0x11 && buffer[3] === 0xe0
  if (!isZip && !isOle) throw new BadRequestException("El archivo UENO debe ser .xls o .xlsx.")
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false })
  } catch {
    throw new BadRequestException("El archivo UENO debe ser un Excel valido.")
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const matrix = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false, defval: "" })
    : []
  const headerIndex = matrix.slice(0, 10).findIndex((row) =>
    row.some((cell) => normalize(cell) === normalize(UENO_COLUMNS.authorization)))
  if (headerIndex < 0) {
    throw new BadRequestException(
      `No se encontro el encabezado UENO (columna ${UENO_COLUMNS.authorization}).`
    )
  }

  const header = matrix[headerIndex].map(normalize)
  const field = (name: string) => {
    const index = header.indexOf(normalize(name))
    if (index < 0) throw new BadRequestException(`Falta la columna UENO: ${name}.`)
    return index
  }
  const optionalField = (name: string) => header.indexOf(normalize(name))
  const saleDateIndex = field(UENO_COLUMNS.saleDate)
  const authorizationIndex = field(UENO_COLUMNS.authorization)
  const grossIndex = field(UENO_COLUMNS.grossAmount)
  const netIndex = field(UENO_COLUMNS.netAmount)
  const cardTypeIndex = field(UENO_COLUMNS.cardType)
  const accreditationIndex = field(UENO_COLUMNS.accreditationDate)
  const voucherIndex = field(UENO_COLUMNS.paymentVoucher)
  const stateIndex = field(UENO_COLUMNS.paymentState)
  const brandIndex = optionalField(UENO_COLUMNS.brand)
  const cardNumberIndex = optionalField(UENO_COLUMNS.cardNumber)
  const ticketIndex = optionalField(UENO_COLUMNS.ticket)
  const columns = [
    "Referencia", "Fecha", "Importe",
    UENO_COLUMNS.authorization, UENO_COLUMNS.saleDate, UENO_COLUMNS.grossAmount,
    UENO_COLUMNS.netAmount, UENO_COLUMNS.commission, UENO_COLUMNS.cardType,
    UENO_COLUMNS.accreditationDate, UENO_COLUMNS.paymentVoucher, UENO_COLUMNS.brand,
    UENO_COLUMNS.cardNumber, UENO_COLUMNS.ticket, UENO_COLUMNS.paymentState
  ]
  const rows: Record<string, unknown>[] = []
  let totalRows = 0

  for (const [offset, row] of matrix.slice(headerIndex + 1).entries()) {
    if (!row.some((cell) => text(cell))) continue
    totalRows += 1
    const excelRow = headerIndex + offset + 2
    // Solo las ventas aprobadas son depositables.
    if (normalize(row[stateIndex]) !== "aprobado") continue
    const accreditationRaw = text(row[accreditationIndex])
    const paymentVoucher = text(row[voucherIndex])
    // Una venta aprobada aun no liquidada no tiene deposito bancario todavia.
    if (!accreditationRaw || !paymentVoucher) continue

    const authorization = text(row[authorizationIndex])
    const saleDate = parseUenoDate(row[saleDateIndex])
    const accreditationDate = parseUenoDate(row[accreditationIndex])
    const gross = parseUenoAmount(row[grossIndex])
    const net = parseUenoAmount(row[netIndex])
    if (!authorization) {
      throw new BadRequestException(`Fila ${excelRow} de UENO: falta ${UENO_COLUMNS.authorization}.`)
    }
    if (!saleDate || !accreditationDate) {
      throw new BadRequestException(
        `Fila ${excelRow} de UENO: ${UENO_COLUMNS.saleDate} o ${UENO_COLUMNS.accreditationDate} invalida.`
      )
    }
    if (gross === null || net === null || gross <= 0 || net < 0 || net > gross) {
      throw new BadRequestException(
        `Fila ${excelRow} de UENO: ${UENO_COLUMNS.grossAmount} y ${UENO_COLUMNS.netAmount} no son validos.`
      )
    }
    const read = (index: number) => (index >= 0 ? text(row[index]) : "")
    rows.push({
      Referencia: authorization,
      Fecha: saleDate,
      Importe: gross,
      [UENO_COLUMNS.authorization]: authorization,
      [UENO_COLUMNS.saleDate]: saleDate,
      [UENO_COLUMNS.grossAmount]: gross,
      [UENO_COLUMNS.netAmount]: net,
      [UENO_COLUMNS.commission]: Number((gross - net).toFixed(6)),
      [UENO_COLUMNS.cardType]: resolveUenoCardType(row[cardTypeIndex]),
      [UENO_COLUMNS.accreditationDate]: accreditationDate,
      [UENO_COLUMNS.paymentVoucher]: paymentVoucher,
      [UENO_COLUMNS.brand]: read(brandIndex),
      [UENO_COLUMNS.cardNumber]: read(cardNumberIndex),
      [UENO_COLUMNS.ticket]: read(ticketIndex),
      [UENO_COLUMNS.paymentState]: text(row[stateIndex])
    })
  }
  if (totalRows === 0) throw new BadRequestException("El Excel UENO no contiene operaciones.")
  return { columns, rows, totalRows }
}
