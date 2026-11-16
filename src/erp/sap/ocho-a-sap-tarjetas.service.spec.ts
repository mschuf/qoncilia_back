import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { SendOchoAUenoDepositDto } from "./dto/send-ocho-a-ueno-deposit.dto"
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

describe("OchoASapTarjetasService - Tarjeta UENO", () => {
  const sapErpService = {
    compareSapB1QueryPreview: jest.fn(),
    runSapTarjetasSystemQuery: jest.fn(),
    validateSapTarjetasVoucherGross: jest.fn(),
    createSapTarjetasDeposit: jest.fn()
  }
  const commissionRepository = { findOne: jest.fn() }
  const service = new OchoASapTarjetasService(
    sapErpService as unknown as SapErpService,
    commissionRepository as never
  )
  const deposit = (overrides: Partial<SendOchoAUenoDepositDto> = {}) =>
    ({
      companyErpConfigId: 7,
      depositAccount: "1112801010",
      depositDate: "2026-03-16",
      bankReference: "5253602",
      uenoCardType: "Crédito Local",
      uenoGrossAmount: 692003,
      uenoNetAmount: 669657,
      commission: 22346,
      creditLines: [{ absId: 10 }, { absId: 11 }],
      ...overrides
    }) as SendOchoAUenoDepositDto

  beforeEach(() => {
    Object.values(sapErpService).forEach((mock) => mock.mockReset())
    commissionRepository.findOne.mockReset()
  })

  it("rechaza empresas distintas de OCHO_A", () => {
    expect(() =>
      service.compareUenoQueryPreview({ companyCode: "IRVINE" } as AuthUser, comparisonPayload("debit"))
    ).toThrow("exclusivo de OCHO A")
  })

  it("compara Codigo de autorizacion, Fecha de venta y Monto bruto exigiendo fecha exacta", () => {
    const payload: CompareSapB1QueryPreviewDto = {
      companyErpConfigId: 7,
      bank: {
        columns: ["Código de autorización", "Fecha de venta", "Monto bruto"],
        rows: [{ "Código de autorización": "431508", "Fecha de venta": "2026-03-13", "Monto bruto": 242000 }]
      },
      system: { columns: ["Referencia", "Fecha", "Importe"], rows: [] }
    }

    service.compareUenoQueryPreview(actor, payload)

    expect(sapErpService.compareSapB1QueryPreview).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        columns: ["Referencia", "Fecha", "Importe"],
        referenceMatchMode: "like",
        strictReferenceAmountMatch: true,
        groupSystemMatches: false,
        bank: {
          columns: ["Código de autorización", "Fecha de venta", "Monto bruto", "Referencia", "Fecha", "Importe"],
          rows: [expect.objectContaining({ Referencia: "431508", Fecha: "2026-03-13", Importe: 242000 })]
        }
      }),
      { requireExactDateMatch: true }
    )
  })

  it("consulta SAP desde la primera Fecha de venta del rango de acreditacion", async () => {
    sapErpService.runSapTarjetasSystemQuery.mockResolvedValue({ dateFrom: "x", dateTo: "y" })

    const result = await service.runUenoSystemQuery(actor, {
      companyErpConfigId: 7,
      dateFrom: "2026-03-16",
      dateTo: "2026-03-20",
      saleDateFrom: "2026-03-13",
      saleDateTo: "2026-03-19"
    })

    expect(sapErpService.runSapTarjetasSystemQuery).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ dateFrom: "2026-03-13", dateTo: "2026-03-20" })
    )
    expect(result).toMatchObject({ dateFrom: "2026-03-16", dateTo: "2026-03-20" })
  })

  it("deposita el lote con REF = comprobante y comision = bruto - neto", async () => {
    commissionRepository.findOne.mockResolvedValue({ creditCommissionAccount: "1111000104" })

    await service.createUenoDeposit(actor, deposit())

    expect(sapErpService.validateSapTarjetasVoucherGross).toHaveBeenCalledWith(
      actor, 7, [10, 11], 692003, "UENO"
    )
    expect(sapErpService.createSapTarjetasDeposit).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ commission: 22346, journalRemarks: "COMPRA P.O.S UENO" }),
      {
        bankReference: "5253602",
        commission: { account: "1111000104", amount: 22346 }
      }
    )
  })

  it("no envia cabecera de comision cuando el bruto es igual al neto", async () => {
    await service.createUenoDeposit(
      actor,
      deposit({ uenoGrossAmount: 2, uenoNetAmount: 2, commission: 0 })
    )

    expect(commissionRepository.findOne).not.toHaveBeenCalled()
    expect(sapErpService.createSapTarjetasDeposit).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ commission: undefined }),
      { bankReference: "5253602" }
    )
  })

  it("rechaza un deposito sin comprobante o con comision inconsistente", async () => {
    await expect(service.createUenoDeposit(actor, deposit({ bankReference: " " }))).rejects.toThrow(
      "Nro. de comprobante"
    )
    await expect(service.createUenoDeposit(actor, deposit({ commission: 1 }))).rejects.toThrow(
      "no cuadran"
    )
    expect(sapErpService.createSapTarjetasDeposit).not.toHaveBeenCalled()
  })
})
