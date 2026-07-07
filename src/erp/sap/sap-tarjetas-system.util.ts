import type { PublicSapB1QueryTable } from "./interfaces/sap-erp.interfaces"

// Lado SISTEMA del modo SAP_TARJETAS: el query OCRH devuelve las columnas crudas
// de SAP (AbsId, VoucherNum, PayDate, CreditSum, CreditCurr). El motor de matching
// (compartido con SAP_B1) compara por nombre de columna IDENTICO en ambos lados,
// asi que el lado sistema debe exponer los MISMOS alias canonicos que produce el
// parser del CSV de la procesadora (ver sap-tarjetas-csv.util.ts):
//
//   VoucherNum -> Referencia  (= "Codigo autorizacion" del CSV; match exacto)
//   PayDate    -> Fecha       (match por fecha +/- 7 dias)
//   CreditSum  -> Importe     (GATE DURO: si el importe no coincide, no hay match)
//
// Las columnas no mapeadas (AbsId, CreditCurr, ...) se conservan tal cual: son
// informativas para la comparacion manual del usuario. Si el query ya trae los
// alias (p.ej. una version anterior que aliasaba en el propio SELECT), el mapeo
// es un no-op y el match sigue funcionando: degrada sin romper. NO toca SAP_B1.
const SYSTEM_COLUMN_ALIASES: Record<string, string> = {
  vouchernum: "Referencia",
  paydate: "Fecha",
  creditsum: "Importe"
}

function normalizeColumnKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

// Renombra las columnas del query del sistema a los alias canonicos del matching.
// No muta la tabla original: devuelve una copia con columnas y filas reescritas.
export function aliasSapTarjetasSystemTable(
  table: PublicSapB1QueryTable
): PublicSapB1QueryTable {
  const rename = (column: string): string =>
    SYSTEM_COLUMN_ALIASES[normalizeColumnKey(column)] ?? column

  const columns: string[] = []
  const seen = new Set<string>()
  for (const column of table.columns) {
    const next = rename(column)
    if (seen.has(next)) continue
    seen.add(next)
    columns.push(next)
  }

  const rows = table.rows.map((row) => {
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      next[rename(key)] = value
    }
    return next
  })

  return { columns, rows }
}
