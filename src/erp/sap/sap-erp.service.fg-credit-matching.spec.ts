import type { ConciliationPreviewRow } from "../../conciliation/interfaces/conciliation.interfaces"
import type { PublicSapB1SmartMatch } from "./interfaces/sap-erp.interfaces"
import { SapErpService } from "./sap-erp.service"

type MatchColumns = {
  reference: string | null
  reference2: string | null
  date: string | null
  amount: string | null
  debit: string | null
  credit: string | null
}

type FallbackColumns = {
  systemDate: string
  bankSaleDate: string
  bankTransaction: string
}

type SapErpMatchingInternals = {
  calculateFgCreditCardTransactionFallbackMatches(
    systemRows: ConciliationPreviewRow[],
    bankRows: ConciliationPreviewRow[],
    columns: MatchColumns,
    fallbackColumns: FallbackColumns
  ): PublicSapB1SmartMatch[]
}

const matchingService = Object.create(
  SapErpService.prototype
) as SapErpMatchingInternals

const matchColumns: MatchColumns = {
  reference: "Referencia",
  reference2: null,
  date: "Fecha",
  amount: "Importe",
  debit: null,
  credit: null
}

const fallbackColumns: FallbackColumns = {
  systemDate: "Fecha",
  bankSaleDate: "Fecha de venta",
  bankTransaction: "Nro. transaccion"
}

const previewRow = (
  rowId: string,
  values: Record<string, string | null>
): ConciliationPreviewRow => ({
  rowId,
  rowNumber: 1,
  values,
  normalized: Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value?.toLowerCase() ?? null])
  )
})

const systemRow = (rowId: string, reference: string, amount: string, date = "2026-06-02") =>
  previewRow(rowId, {
    Referencia: reference,
    Fecha: date,
    Importe: amount
  })

const bankRow = (
  rowId: string,
  authorization: string,
  transaction: string,
  amount: string,
  saleDate = "02/06/2026"
) =>
  previewRow(rowId, {
    Referencia: authorization,
    "Nro. transaccion": transaction,
    "Fecha de venta": saleDate,
    "Fecha de credito del comercio": "04/06/2026",
    Importe: amount
  })

const calculateFallback = (
  systemRows: ConciliationPreviewRow[],
  bankRows: ConciliationPreviewRow[]
) =>
  matchingService.calculateFgCreditCardTransactionFallbackMatches(
    systemRows,
    bankRows,
    matchColumns,
    fallbackColumns
  )

describe("matching de respaldo para Pago Credito FG_TARJETA_QA", () => {
  it("recupera los cinco casos analizados mediante el sufijo de Nro. transaccion", () => {
    const cases = [
      ["920709", "394760", "5429920709", "7624925"],
      ["878487", "000000000028029", "5429878487", "1766100"],
      ["446029", "943393", "5429446029", "962231"],
      ["388413", "882708", "5429388413", "2699250"],
      ["095732", "579100", "5429095732", "2322000"]
    ] as const
    const systemRows = cases.map(([reference, , , amount], index) =>
      systemRow(`system-${index}`, reference, amount)
    )
    const bankRows = cases.map(([, authorization, transaction, amount], index) =>
      bankRow(`bank-${index}`, authorization, transaction, amount)
    )

    const matches = calculateFallback(systemRows, bankRows)

    expect(matches).toHaveLength(5)
    expect(matches.map((match) => [match.systemRow.rowId, match.bankRow.rowId])).toEqual(
      cases.map((_, index) => [`system-${index}`, `bank-${index}`])
    )
  })

  it("exige importe bruto exactamente igual", () => {
    const matches = calculateFallback(
      [systemRow("system", "920709", "7624925")],
      [bankRow("bank", "394760", "5429920709", "7624924")]
    )

    expect(matches).toEqual([])
  })

  it("exige que Fecha SAP sea exactamente Fecha de venta", () => {
    const matches = calculateFallback(
      [systemRow("system", "920709", "7624925", "2026-06-03")],
      [bankRow("bank", "394760", "5429920709", "7624925", "02/06/2026")]
    )

    expect(matches).toEqual([])
  })

  it("rechaza referencias demasiado cortas", () => {
    const matches = calculateFallback(
      [systemRow("system", "1", "7624925")],
      [bankRow("bank", "394760", "5429920709", "7624925")]
    )

    expect(matches).toEqual([])
  })

  it("rechaza pares ambiguos en cualquiera de los dos sentidos", () => {
    const matches = calculateFallback(
      [systemRow("system", "920709", "7624925")],
      [
        bankRow("bank-1", "394760", "5429920709", "7624925"),
        bankRow("bank-2", "otra", "1111920709", "7624925")
      ]
    )

    expect(matches).toEqual([])
  })
})
