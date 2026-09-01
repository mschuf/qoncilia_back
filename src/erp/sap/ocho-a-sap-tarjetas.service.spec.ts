import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { OchoASapTarjetasService } from "./ocho-a-sap-tarjetas.service"
import { SapErpService } from "./sap-erp.service"

const actor = { companyCode: "OCHO_A" } as AuthUser

const comparisonPayload = (
  cardPaymentKind: "debit" | "credit"
): CompareSapB1QueryPreviewDto => ({
  companyErpConfigId: 1,
  bank: {
    columns: ["Referencia", "Fecha", "Fecha de venta", "Importe"],
    rows: []
  },
  system: {
    columns: ["Referencia", "Fecha", "Importe"],
    rows: []
  },
  columns: ["Referencia", "Fecha", "Importe"],
  cardPaymentKind
})

describe("OchoASapTarjetasService", () => {
  const compareSapB1QueryPreview = jest.fn()
  const service = new OchoASapTarjetasService(
    { compareSapB1QueryPreview } as unknown as SapErpService,
    {} as never
  )

  beforeEach(() => {
    compareSapB1QueryPreview.mockReset()
  })

  it("exige Fecha SAP = Fecha de venta solo para crédito", () => {
    const payload = comparisonPayload("credit")

    service.compareQueryPreview(actor, payload)

    expect(compareSapB1QueryPreview).toHaveBeenCalledWith(actor, payload, {
      requireExactDateMatch: true
    })
  })

  it("no cambia el matching de débito", () => {
    const payload = comparisonPayload("debit")

    service.compareQueryPreview(actor, payload)

    expect(compareSapB1QueryPreview).toHaveBeenCalledWith(actor, payload, undefined)
  })
})
