import { ErpType } from "../../common/enums/erp-type.enum"
import type { AuthUser } from "../../common/interfaces/auth-user.interface"
import { OchoASapTarjetasService } from "./ocho-a-sap-tarjetas.service"
import { SapErpService } from "./sap-erp.service"

// Recorre el motor real de matching (compareSapB1QueryPreview) con la fachada
// UENO de OCHO_A; solo se reemplaza la carga de la configuracion ERP.
const actor = { companyCode: "OCHO_A", companyId: 6, roleCode: "admin" } as AuthUser
const sapErpService = Object.create(SapErpService.prototype) as SapErpService
Object.assign(sapErpService, {
  requireConfigForActor: jest.fn().mockResolvedValue({
    id: 7,
    erpType: ErpType.SAP_B1,
    code: "SAP_TARJETAS",
    active: true,
    company: { id: 6 }
  })
})
const service = new OchoASapTarjetasService(sapErpService, {} as never)

const uenoRow = (authorization: string, saleDate: string, gross: number) => ({
  "Código de autorización": authorization,
  "Fecha de venta": saleDate,
  "Monto bruto": gross,
  "Monto neto": gross - 100,
  "Tipo de tarjeta": "Crédito Local",
  "Fecha de Acreditación": "2026-03-16",
  "Nro. de comprobante de pago": "5253602"
})

const compare = (systemRows: Record<string, unknown>[]) =>
  service.compareUenoQueryPreview(actor, {
    companyErpConfigId: 7,
    bank: {
      columns: Object.keys(uenoRow("", "", 0)),
      rows: [uenoRow("431508", "2026-03-13", 242000), uenoRow("547217", "2026-03-13", 150000)]
    },
    system: { columns: ["AbsId", "Referencia", "Fecha", "Importe"], rows: systemRows }
  })

describe("matching Tarjeta UENO de OCHO_A", () => {
  it("cruza por Codigo de autorizacion, Fecha de venta y Monto bruto", async () => {
    const result = await compare([
      { AbsId: 1, Referencia: "431508", Fecha: "2026-03-13", Importe: "242000.000000" },
      { AbsId: 2, Referencia: "547217", Fecha: "2026-03-13", Importe: "150000.000000" }
    ])

    expect(result.matches).toHaveLength(2)
    expect(result.matches.map((match) => match.systemRow.values.AbsId)).toEqual(["1", "2"])
    expect(result.matches.every((match) => match.matchReason === "reference")).toBe(true)
  })

  it("no cruza si la Fecha SAP difiere de la Fecha de venta o el bruto no coincide", async () => {
    const result = await compare([
      { AbsId: 1, Referencia: "431508", Fecha: "2026-03-14", Importe: "242000" },
      { AbsId: 2, Referencia: "547217", Fecha: "2026-03-13", Importe: "145156" }
    ])

    expect(result.matches).toEqual([])
    expect(result.metrics.unmatchedBank).toBe(2)
  })
})
