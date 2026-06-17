// Analiza el payload de conciliacion externa (front -> back) en busca de
// anomalias que pueden disparar el error SAP -2028 "No matching records found".
//
// Uso:
//   1) Guarda el JSON que mandaste como  payload.json  en esta misma carpeta.
//   2) node analyze-recon-payload.mjs payload.json
//
// Detecta: duplicados de sequence, duplicados de (transactionNumber,lineNumber),
// inconsistencias de cuenta, descalce entre matches y bankStatementLines,
// y (si el payload trae montos) si la conciliacion balancea.

import { readFileSync } from "node:fs"

const file = process.argv[2] ?? "payload.json"
const data = JSON.parse(readFileSync(file, "utf8"))

const matches = Array.isArray(data.matches) ? data.matches : []
const bankLines = Array.isArray(data.bankStatementLines) ? data.bankStatementLines : []
const account = data.accountCode ?? null

const fail = []
const ok = []

// 1) Conteos
ok.push(`matches: ${matches.length}`)
ok.push(`bankStatementLines: ${bankLines.length}`)
if (bankLines.length && matches.length !== bankLines.length) {
  fail.push(
    `Descalce: ${matches.length} matches vs ${bankLines.length} bankStatementLines.`
  )
}

// 2) Duplicados de sequence (banco) en matches
const seqCount = new Map()
for (const m of matches) {
  const s = m.sequence
  seqCount.set(s, (seqCount.get(s) ?? 0) + 1)
}
const dupSeq = [...seqCount.entries()].filter(([, n]) => n > 1)
if (dupSeq.length) {
  fail.push(
    `Sequences DUPLICADAS en matches: ${dupSeq.map(([s, n]) => `${s} x${n}`).join(", ")}`
  )
} else {
  ok.push(`sequences unicas en matches: ${seqCount.size}`)
}

// 3) Duplicados de (transactionNumber, lineNumber) en matches
const jeCount = new Map()
for (const m of matches) {
  const k = `${m.transactionNumber}#${m.lineNumber}`
  jeCount.set(k, (jeCount.get(k) ?? 0) + 1)
}
const dupJe = [...jeCount.entries()].filter(([, n]) => n > 1)
if (dupJe.length) {
  fail.push(
    `Lineas de asiento DUPLICADAS (txn#line): ${dupJe.map(([k, n]) => `${k} x${n}`).join(", ")}`
  )
} else {
  ok.push(`lineas de asiento unicas: ${jeCount.size}`)
}

// 4) Duplicados de sequence dentro de bankStatementLines
const bslCount = new Map()
for (const b of bankLines) {
  bslCount.set(b.sequence, (bslCount.get(b.sequence) ?? 0) + 1)
}
const dupBsl = [...bslCount.entries()].filter(([, n]) => n > 1)
if (dupBsl.length) {
  fail.push(
    `Sequences DUPLICADAS en bankStatementLines: ${dupBsl.map(([s, n]) => `${s} x${n}`).join(", ")}`
  )
}

// 5) bankStatementLines vs matches: misma coleccion de sequences
if (bankLines.length) {
  const inMatches = new Set(seqCount.keys())
  const inBsl = new Set(bslCount.keys())
  const soloBsl = [...inBsl].filter((s) => !inMatches.has(s))
  const soloMatches = [...inMatches].filter((s) => !inBsl.has(s))
  if (soloBsl.length) fail.push(`Sequences en bankStatementLines pero NO en matches: ${soloBsl.join(", ")}`)
  if (soloMatches.length) fail.push(`Sequences en matches pero NO en bankStatementLines: ${soloMatches.join(", ")}`)
}

// 6) Cuenta consistente
const cuentasRaras = matches.filter((m) => m.bankStatementAccountCode !== account)
if (account && cuentasRaras.length) {
  fail.push(
    `${cuentasRaras.length} matches con bankStatementAccountCode != ${account}`
  )
}

// 7) lineNumber/transactionNumber faltantes o invalidos
const sinDatos = matches.filter(
  (m) =>
    m.transactionNumber == null ||
    m.lineNumber == null ||
    !Number.isFinite(Number(m.transactionNumber)) ||
    !Number.isFinite(Number(m.lineNumber)) ||
    Number(m.lineNumber) < 0
)
if (sinDatos.length) {
  fail.push(
    `${sinDatos.length} matches sin transactionNumber/lineNumber valido (ej: ${JSON.stringify(sinDatos[0])})`
  )
}

// 8) Balance (solo si el payload trae montos por match)
const conMonto = matches.filter((m) => m.amount != null || m.debit != null || m.credit != null)
if (conMonto.length) {
  const total = matches.reduce((acc, m) => {
    const amt = Number(m.amount ?? (Number(m.debit ?? 0) - Number(m.credit ?? 0)))
    return acc + (Number.isFinite(amt) ? amt : 0)
  }, 0)
  ok.push(`suma de montos de matches: ${total.toFixed(2)} (deberia ser 0 si balancea)`)
  if (Math.abs(total) > 0.009) fail.push(`La conciliacion NO balancea: neto ${total.toFixed(2)}`)
} else {
  ok.push("(el payload no trae montos por match: el balance se valida en SAP, no aqui)")
}

console.log("=== OK / info ===")
ok.forEach((l) => console.log("  -", l))
console.log("\n=== POSIBLES PROBLEMAS ===")
if (fail.length === 0) {
  console.log("  (ninguno detectable desde el payload: estructura consistente y sin duplicados)")
  console.log("  -> El -2028 viene del ESTADO en SAP (registro ya conciliado/inexistente) o del balance.")
} else {
  fail.forEach((l) => console.log("  !", l))
}
