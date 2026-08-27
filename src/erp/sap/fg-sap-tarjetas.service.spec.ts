import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { RunSapTarjetasQueryDto } from "./dto/run-sap-tarjetas-query.dto"
import { SendSapTarjetasDepositDto } from "./dto/send-sap-tarjetas-deposit.dto"
import { FgSapTarjetasService } from "./fg-sap-tarjetas.service"
import { SapErpService } from "./sap-erp.service"

const actorFor = (companyCode: string) => ({ companyCode }) as AuthUser

const comparisonPayload = (
  cardPaymentKind: "debit" | "credit"
): CompareSapB1QueryPreviewDto => ({
  companyErpConfigId: 1,
  bank: {
    columns: ["Referencia", "Nro. transaccion", "Fecha de venta", "Importe"],
    rows: []
  },
  system: {
    columns: ["Referencia", "Fecha", "Importe"],
    rows: []
  },
  columns: ["Referencia", "Fecha", "Importe"],
  cardPaymentKind
})

const systemQueryPayload: RunSapTarjetasQueryDto = {
  companyErpConfigId: 1,
  dateFrom: "2026-06-01",
  dateTo: "2026-06-30"
}

const creditDepositPayload: SendSapTarjetasDepositDto = {
  companyErpConfigId: 1,
  depositAccount: "1.01.02.001.010",
  voucherAccount: "1.01.01.003.012",
  depositDate: "2026-06-04",
  bank: "GNB",
  bankAccountNum: "1014137069",
  commission: 491995,
  creditLines: [{ absId: 311190 }]
}

describe("FgSapTarjetasService", () => {
  const compareSapB1QueryPreview = jest.fn()
  const runSapTarjetasSystemQuery = jest.fn()
  const service = new FgSapTarjetasService(
    { compareSapB1QueryPreview, runSapTarjetasSystemQuery } as unknown as SapErpService,
    {} as never
  )

  beforeEach(() => {
    compareSapB1QueryPreview.mockReset()
    runSapTarjetasSystemQuery.mockReset()
  })

  it("habilita el fallback solamente para credito de FG_TARJETA_QA", () => {
    const actor = actorFor("FG_TARJETA_QA")
    const payload = comparisonPayload("credit")

    service.compareQueryPreview(actor, payload)

    expect(compareSapB1QueryPreview).toHaveBeenCalledWith(
      actor,
      {
        ...payload,
        referenceMatchMode: "like",
        strictReferenceAmountMatch: true
      },
      { fgCreditCardTransactionFallback: true }
    )
  })

  it("mantiene sin cambios el matching de debito de FG_TARJETA_QA", () => {
    const actor = actorFor("FG_TARJETA_QA")
    const payload = comparisonPayload("debit")

    service.compareQueryPreview(actor, payload)

    expect(compareSapB1QueryPreview).toHaveBeenCalledWith(actor, payload)
  })

  it("mantiene sin cambios el matching de credito de FG productivo", () => {
    const actor = actorFor("FG_TARJETA")
    const payload = comparisonPayload("credit")

    service.compareQueryPreview(actor, payload)

    expect(compareSapB1QueryPreview).toHaveBeenCalledWith(actor, payload)
  })

  it("carga OCRH.CreditAcct solamente al consultar FG_TARJETA_QA", () => {
    const actor = actorFor("FG_TARJETA_QA")

    service.runSystemQuery(actor, systemQueryPayload)

    expect(runSapTarjetasSystemQuery).toHaveBeenCalledWith(actor, systemQueryPayload, {
      includeCreditVoucherAccount: true
    })
  })

  it("no cambia la consulta de tarjetas para FG productivo", () => {
    const actor = actorFor("FG_TARJETA")

    service.runSystemQuery(actor, systemQueryPayload)

    expect(runSapTarjetasSystemQuery).toHaveBeenCalledWith(actor, systemQueryPayload)
  })

  it("solicita la conciliacion automatica en credito de FG_TARJETA_QA", async () => {
    const createSapTarjetasDeposit = jest.fn().mockResolvedValue({})
    const commissionConfigRepository = {
      findOne: jest.fn().mockResolvedValue({ creditCommissionAccount: "6.01.01.001.210" })
    }
    const creditService = new FgSapTarjetasService(
      { createSapTarjetasDeposit } as unknown as SapErpService,
      commissionConfigRepository as never
    )
    const actor = actorFor("FG_TARJETA_QA")

    await creditService.createCreditDeposit(actor, creditDepositPayload)

    expect(createSapTarjetasDeposit).toHaveBeenCalledWith(actor, creditDepositPayload, {
      commission: { account: "6.01.01.001.210", amount: 491995 },
      reconcileAfterDeposit: "tYES"
    })
  })
})
