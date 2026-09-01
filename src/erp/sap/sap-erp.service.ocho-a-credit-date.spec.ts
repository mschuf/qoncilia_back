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

type SapErpMatchingInternals = {
  calculateSapB1SmartMatches(
    systemRows: ConciliationPreviewRow[],
    bankRows: ConciliationPreviewRow[],
    columns: MatchColumns,
    referenceMatchMode: "exact" | "like",
    strictReferenceAmountMatch: boolean,
    requireExactDateMatch: boolean
  ): PublicSapB1SmartMatch[]
}

const matchingService = Object.create(
  SapErpService.prototype
) as SapErpMatchingInternals

const columns: MatchColumns = {
  reference: "Referencia",
  reference2: null,
  date: "Fecha",
  amount: "Importe",
  debit: null,
  credit: null
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

const calculate = (systemDate: string, saleDate: string) =>
  matchingService.calculateSapB1SmartMatches(
    [previewRow("system", { Referencia: "000123", Fecha: systemDate, Importe: "250000" })],
    [
      previewRow("bank", {
        Referencia: "123",
        Fecha: saleDate,
        "Fecha de venta": saleDate,
        "Fecha de credito del comercio": "2026-06-10",
        Importe: "250000"
      })
    ],
    columns,
    "like",
    true,
    true
  )

describe("matching de crédito OCHO_A por Fecha de venta", () => {
  it("rechaza la referencia e importe correctos si Fecha SAP difiere de Fecha de venta", () => {
    expect(calculate("2026-06-03", "2026-06-04")).toEqual([])
  })

  it("acepta solo la coincidencia exacta de Fecha SAP con Fecha de venta", () => {
    const matches = calculate("2026-06-04", "2026-06-04")

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      matchReason: "reference",
      column1Match: true,
      column2Match: true,
      column3Match: true,
      dateDifferenceDays: 0
    })
  })
})
