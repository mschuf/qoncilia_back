import * as XLSX from "xlsx"

// Parser del archivo de liquidacion de la procesadora para SAP_TARJETAS.
// Soporta CSV texto separado por ";" y Excel real (.xls/.xlsx). El archivo se
// procesa en memoria y no se persiste.
//
// Solo se incluyen filas con "Tipo de tarjeta" = Debito. Las columnas clave se
// aliasan a los mismos nombres canonicos del lado sistema:
//   Codigo autorizacion           -> Referencia (match con VoucherNum)
//   Fecha de credito del comercio -> Fecha      (match con PayDate)
//   Importe                       -> Importe    (match con CreditSum)
// "Nro. transaccion" se conserva para proponer VoucherAccount en el deposito.

export type SapTarjetasCsvParseResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
}

const COLUMN_MAP: Array<{ source: string; target: string; kind?: "date" }> = [
  { source: "Codigo autorizacion", target: "Referencia" },
  { source: "Nro. transaccion", target: "Nro. transaccion" },
  { source: "Fecha de credito del comercio", target: "Fecha", kind: "date" },
  { source: "Importe", target: "Importe" },
  { source: "Tipo de tarjeta", target: "Tipo de tarjeta" },
  { source: "Marca", target: "Marca" },
  { source: "Emisor", target: "Emisor" },
  { source: "Nro. tarjeta", target: "Nro. tarjeta" },
  { source: "Estado", target: "Estado" }
]

export function parseSapTarjetasCsv(buffer: Buffer): SapTarjetasCsvParseResult {
  const matrix = parseInputMatrix(buffer).filter((row) => row.some((cell) => cell !== ""))

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

    const typeIndex = headerIndex.get(normalizeHeader("Tipo de tarjeta"))
    const cardType = typeIndex === undefined ? "" : cleanCell(rawRow[typeIndex] ?? "")
    if (normalizeHeader(cardType) !== "debito") {
      continue
    }

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

function parseInputMatrix(buffer: Buffer): string[][] {
  if (looksLikeWorkbook(buffer)) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const worksheet = sheetName ? workbook.Sheets[sheetName] : null
    if (worksheet) {
      return XLSX.utils.sheet_to_json<string[]>(worksheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: ""
      })
    }
  }

  const hasUtf8Bom =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const content = (hasUtf8Bom ? buffer.subarray(3).toString("utf8") : buffer.toString("latin1"))
    .replace(/^\u00ef\u00bb\u00bf/, "")
    .replace(/^\ufeff/, "")
  return parseDelimited(content, ";")
}

function looksLikeWorkbook(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
  const isOle =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  return isZip || isOle
}

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

function cleanCell(value: string): string {
  const trimmed = value.trim()
  const excelText = /^="(.*)"$/.exec(trimmed)
  return (excelText ? excelText[1] : trimmed).trim()
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function toIsoDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value)
  if (!match) return value
  const [, day, month, year] = match
  const dayNum = Number(day)
  const monthNum = Number(month)
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return value
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}
