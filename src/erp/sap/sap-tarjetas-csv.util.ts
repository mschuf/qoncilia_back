import type { PublicSapB1QueryTable } from "./interfaces/sap-erp.interfaces"

// Parser del CSV de liquidacion de la procesadora (BANCARD u otra) para el modo
// SAP_TARJETAS. El archivo se procesa EN MEMORIA y nunca se persiste: solo sirve
// para matchear contra los datos del sistema (query OCRH).
//
// Caracteristicas del archivo:
//  - separador ";" (punto y coma)
//  - codificacion ISO-8859-1 (latin1)
//  - campos opcionalmente entre comillas dobles, con comillas escapadas como ""
//  - artificio Excel ="texto" para forzar texto (ej: ="00", ="174782")
//
// Se devuelven TODAS las filas del CSV (debito, credito, otros): NO se filtra por
// "Tipo de tarjeta" — esa columna queda visible para que el usuario distinga el
// tipo de cada registro. Las columnas clave se aliasan a los MISMOS nombres
// canonicos que expone el lado sistema (ver sap-tarjetas-system.util.ts), porque
// el motor compara por nombre de columna identico en ambos lados:
//   Codigo autorizacion           -> "Referencia" (match con VoucherNum, exacta)
//   Fecha de credito del comercio -> "Fecha"      (match con PayDate, +/- 7 dias)
//   Importe                       -> "Importe"    (match con CreditSum, GATE DURO)

export type SapTarjetasCsvParseResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
}

// Columnas del CSV de origen -> columna de salida. El orden define el orden de
// las columnas de la tabla resultante: Referencia primero (alineada con el lado
// sistema para facilitar la comparacion manual). Las primeras tres
// (Referencia/Fecha/Importe) son las que usa el motor de matching; el resto es
// informativo. No se exponen "Nro. transaccion" ni "Importe Neto" (a pedido).
const COLUMN_MAP: Array<{ source: string; target: string; kind?: "date" }> = [
  { source: "Codigo autorizacion", target: "Referencia" },
  { source: "Fecha de credito del comercio", target: "Fecha", kind: "date" },
  { source: "Importe", target: "Importe" },
  { source: "Tipo de tarjeta", target: "Tipo de tarjeta" },
  { source: "Marca", target: "Marca" },
  { source: "Emisor", target: "Emisor" },
  { source: "Nro. tarjeta", target: "Nro. tarjeta" },
  { source: "Estado", target: "Estado" }
]

export function parseSapTarjetasCsv(buffer: Buffer): SapTarjetasCsvParseResult {
  // El contrato es ISO-8859-1, pero si el usuario reexporta desde Excel como
  // UTF-8 (con BOM EF BB BF) lo decodificamos como UTF-8 para no romper acentos.
  const hasUtf8Bom =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const content = (hasUtf8Bom ? buffer.subarray(3).toString("utf8") : buffer.toString("latin1"))
    .replace(/^﻿/, "")
  const matrix = parseDelimited(content, ";").filter((row) => row.some((cell) => cell !== ""))

  if (matrix.length === 0) {
    return { columns: COLUMN_MAP.map((item) => item.target), rows: [], totalRows: 0 }
  }

  const header = matrix[0].map((cell) => cleanCell(cell))
  const headerIndex = new Map<string, number>()
  header.forEach((name, index) => {
    const key = normalizeHeader(name)
    if (!headerIndex.has(key)) headerIndex.set(key, index)
  })

  const columns = COLUMN_MAP.map((item) => item.target)
  const rows: Record<string, unknown>[] = []
  let totalRows = 0

  for (let i = 1; i < matrix.length; i += 1) {
    const rawRow = matrix[i]
    totalRows += 1

    // Sin filtro por tipo de tarjeta: se incluyen todas las filas del CSV.
    const row: Record<string, unknown> = {}
    for (const item of COLUMN_MAP) {
      const sourceIndex = headerIndex.get(normalizeHeader(item.source))
      const rawValue = sourceIndex === undefined ? "" : cleanCell(rawRow[sourceIndex] ?? "")
      row[item.target] = item.kind === "date" ? toIsoDate(rawValue) : rawValue
    }
    rows.push(row)
  }

  return { columns, rows, totalRows }
}

// Lector CSV minimo con soporte de comillas dobles (escape "") y delimitador
// configurable. Maneja saltos \n y \r\n.
function parseDelimited(content: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    // Solo se abre comilla al INICIO del campo (RFC 4180). Asi tanto el caso
    // CSV-citado ("=""174782""") como el crudo (="174782") se preservan literales
    // y cleanCell quita el artificio Excel.
    if (char === '"' && field === "") {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

// Quita el artificio Excel ="..." y espacios sobrantes. "=\"00\"" -> "00".
function cleanCell(value: string): string {
  const trimmed = value.trim()
  const excelText = /^="(.*)"$/.exec(trimmed)
  return (excelText ? excelText[1] : trimmed).trim()
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// "05/06/2026 16:35" -> "2026-06-05". Si no matchea dd/mm/yyyy, devuelve el
// valor original (el motor de matching lo intentara parsear igual).
function toIsoDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value)
  if (!match) return value
  const [, day, month, year] = match
  const dayNum = Number(day)
  const monthNum = Number(month)
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return value
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}
