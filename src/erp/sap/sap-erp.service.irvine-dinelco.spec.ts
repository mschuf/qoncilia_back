import { BadRequestException, ForbiddenException } from "@nestjs/common"
import { ErpType } from "../../common/enums/erp-type.enum"
import type { AuthUser } from "../../common/interfaces/auth-user.interface"
import type { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import type { SendSapTarjetasDepositDto } from "./dto/send-sap-tarjetas-deposit.dto"
import { SapErpService } from "./sap-erp.service"
import { OchoASapTarjetasService } from "./ocho-a-sap-tarjetas.service"

describe("depositos Dinelco de Irvine", () => {
  const actor = { companyCode: "IRVINE", companyId: 1 } as AuthUser

  function service() {
    const instance = Object.create(SapErpService.prototype)
    instance.requireConfigForActor = jest.fn().mockResolvedValue({
      id: 2, company: { id: 1 }, erpType: ErpType.SAP_B1, code: "SAP_TARJETAS", active: true,
      dbName: "IRVINE_TEST"
    })
    instance.validateIrvineDinelcoVouchers = jest.fn().mockResolvedValue(undefined)
    instance.createSapTarjetasDeposit = jest.fn().mockResolvedValue({})
    return instance
  }

  const payload: SendSapTarjetasDepositDto = {
    companyErpConfigId: 2,
    dinelcoBranch: "FUEGO GUARANI",
    dinelcoPresentationGroup: "SPI",
    dinelcoGrossAmount: 351000,
    dinelcoNetAmount: 347139,
    commission: 3861,
    bankReference: "REF-MANUAL-SPI",
    depositAccount: "BANCO_IRVINE",
    voucherAccount: "VOUCHERS_IRVINE",
    depositDate: "2026-09-18",
    journalRemarks: "Comentario usuario",
    creditLines: [{ absId: 101 }]
  }

  it.each([
    ["SPI", "TRANSFERENCIA SPI"],
    ["OTHER", "OTRAS PRESTACIONES"]
  ] as const)("identifica el lote %s en SAP y conserva los vouchers y la referencia", async (group, label) => {
    const instance = service()
    await instance.createIrvineDinelcoDeposit(actor, { ...payload, dinelcoPresentationGroup: group })

    expect(instance.createSapTarjetasDeposit).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        creditLines: payload.creditLines,
        voucherAccount: "BANCO_IRVINE",
        depositDate: "2026-09-18",
        journalRemarks: `DINELCO FUEGO GUARANI | ${label} | Comentario usuario`
      }),
      {
        bankReference: "REF-MANUAL-SPI",
        commission: { account: "6.01.03.001.008", amount: 3861 }
      }
    )
  })

  it("requiere el grupo de prestacion antes de enviar el deposito", async () => {
    const instance = service()
    await expect(instance.createIrvineDinelcoDeposit(actor, {
      ...payload, dinelcoPresentationGroup: undefined
    })).rejects.toBeInstanceOf(BadRequestException)
    expect(instance.createSapTarjetasDeposit).not.toHaveBeenCalled()
  })

  it("rechaza empresas distintas de Irvine antes de consultar configuraciones", async () => {
    const instance = service()
    await expect(instance.createIrvineDinelcoDeposit({
      ...actor, companyCode: "FG_TARJETA"
    }, payload)).rejects.toBeInstanceOf(BadRequestException)
    expect(instance.requireConfigForActor).not.toHaveBeenCalled()
    expect(instance.createSapTarjetasDeposit).not.toHaveBeenCalled()
  })

  it("consulta vouchers desde la venta del 17 y mantiene la acreditacion del 18 para el filtro", async () => {
    const instance = service()
    const rows = [
      { Referencia: "721012", Fecha: "2026-09-17", Importe: 60000 },
      { Referencia: "400726", Fecha: "2026-09-17", Importe: 75000 },
      { Referencia: "222808", Fecha: "2026-09-17", Importe: 65000 }
    ]
    instance.runSapTarjetasSystemQuery = jest.fn().mockResolvedValue({
      dateFrom: "2026-09-17", dateTo: "2026-09-18", system: { rows }
    })
    const result = await instance.runIrvineDinelcoSystemQuery(actor, {
      companyErpConfigId: 2,
      dateFrom: "2026-09-18", dateTo: "2026-09-18",
      saleDateFrom: "2026-09-17", saleDateTo: "2026-09-17"
    })

    expect(instance.runSapTarjetasSystemQuery).toHaveBeenCalledWith(actor,
      expect.objectContaining({ dateFrom: "2026-09-17", dateTo: "2026-09-18" }))
    expect(result.dateFrom).toBe("2026-09-18")
    expect(result.dateTo).toBe("2026-09-18")
    expect(result.system.rows).toEqual(rows)
  })

  it("envia la acreditacion como DepositDate de SAP", () => {
    const instance = service()
    const sapPayload = instance.buildSapTarjetasDepositPayload({
      ...payload,
      dinelcoPresentationGroup: "OTHER",
      dinelcoGrossAmount: 200000,
      dinelcoNetAmount: 193644,
      commission: 6356,
      creditLines: [{ absId: 101 }, { absId: 102 }, { absId: 103 }]
    }, { commission: { account: "6.01.03.001.008", amount: 6356 } })

    expect(sapPayload.DepositDate).toBe("2026-09-18T00:00:00Z")
    expect(sapPayload.CommissionDate).toBe("2026-09-18T00:00:00Z")
    expect(sapPayload.Commission).toBe(6356)
    expect(sapPayload.CommissionAccount).toBe("6.01.03.001.008")
    expect(sapPayload.CreditLines).toEqual([{ AbsId: 101 }, { AbsId: 102 }, { AbsId: 103 }])
  })

  describe("comision de Irvine por Monto menos Monto Neto", () => {
    it.each([
      ["SPI", 351000, 347139, 3861],
      ["OTHER", 200000, 193644, 6356]
    ] as const)("calcula la comision de %s y envia la cuenta indicada aunque el cliente omita commission", async (group, gross, net, expectedCommission) => {
      const instance = service()
      await instance.createIrvineDinelcoDeposit(actor, {
        ...payload,
        dinelcoPresentationGroup: group,
        dinelcoGrossAmount: gross,
        dinelcoNetAmount: net,
        commission: undefined
      })
      const [, resolved, options] = instance.createSapTarjetasDeposit.mock.calls[0]
      expect(resolved.commission).toBe(expectedCommission)
      const sapPayload = instance.buildSapTarjetasDepositPayload(resolved, options)
      expect(sapPayload).toMatchObject({
        Commission: expectedCommission,
        CommissionAccount: "6.01.03.001.008",
        CommissionDate: "2026-09-18T00:00:00Z",
        DepositDate: "2026-09-18T00:00:00Z"
      })
    })

    it("conserva una comision cero cuando bruto y neto son iguales", async () => {
      const instance = service()
      await instance.createIrvineDinelcoDeposit(actor, {
        ...payload, dinelcoGrossAmount: 60000, dinelcoNetAmount: 60000, commission: undefined
      })
      const [, resolved, options] = instance.createSapTarjetasDeposit.mock.calls[0]
      expect(instance.buildSapTarjetasDepositPayload(resolved, options)).toMatchObject({
        Commission: 0, CommissionAccount: "6.01.03.001.008"
      })
    })

    it.each([6357, -6356, Number.NaN])("rechaza una comision informada de %s que no cuadra con los montos", async (commission) => {
      const instance = service()
      await expect(instance.createIrvineDinelcoDeposit(actor, {
        ...payload, dinelcoGrossAmount: 200000, dinelcoNetAmount: 193644, commission
      })).rejects.toBeInstanceOf(BadRequestException)
      expect(instance.validateIrvineDinelcoVouchers).not.toHaveBeenCalled()
      expect(instance.createSapTarjetasDeposit).not.toHaveBeenCalled()
    })
  })

  describe("cuenta vouchers con la misma logica de Ocho A", () => {
    const rows = [
      { AbsId: 101, CreditSum: 60000, CreditAcct: "VOUCHERS_IRVINE" },
      { AbsId: 102, CreditSum: 75000, CreditAcct: "VOUCHERS_IRVINE" },
      { AbsId: 103, CreditSum: 65000, CreditAcct: " VOUCHERS_IRVINE " }
    ]
    const request: SendSapTarjetasDepositDto = {
      ...payload,
      voucherAccount: undefined,
      dinelcoPresentationGroup: "OTHER",
      dinelcoGrossAmount: 200000,
      dinelcoNetAmount: 193644,
      commission: 6356,
      creditLines: rows.map((row) => ({ absId: row.AbsId }))
    }

    function withSapRows(sapRows: Record<string, unknown>[] = rows) {
      const instance = service()
      delete instance.validateIrvineDinelcoVouchers
      instance.connectSapHana = jest.fn().mockResolvedValue({})
      instance.executeSapHanaQuery = jest.fn().mockResolvedValue(sapRows)
      instance.disconnectSapHana = jest.fn().mockResolvedValue(undefined)
      return instance
    }

    it.each(["SPI", "OTHER"] as const)("usa DepositAccount como VoucherAccount para %s", async (group) => {
      const instance = withSapRows()
      await instance.createIrvineDinelcoDeposit(actor, { ...request, dinelcoPresentationGroup: group })
      const resolved = instance.createSapTarjetasDeposit.mock.calls[0][1]
      expect(resolved.voucherAccount).toBe("BANCO_IRVINE")
      const options = instance.createSapTarjetasDeposit.mock.calls[0][2]
      const sapPayload = instance.buildSapTarjetasDepositPayload(resolved, options)
      expect(sapPayload.VoucherAccount).toBe("BANCO_IRVINE")
      expect(sapPayload.DepositAccount).toBe("BANCO_IRVINE")
      expect(sapPayload.CommissionAccount).toBe("6.01.03.001.008")
      expect(sapPayload.Commission).toBe(6356)
      expect(sapPayload.CommissionDate).toBe("2026-09-18T00:00:00Z")
      expect(sapPayload.CreditLines).toEqual(rows.map((row) => ({ AbsId: row.AbsId })))
      expect(instance.executeSapHanaQuery).toHaveBeenCalledWith(
        expect.anything(),
        'SELECT "AbsId", "CreditSum" FROM "OCRH" WHERE "AbsId" IN (?, ?, ?)',
        [101, 102, 103]
      )
      expect(instance.disconnectSapHana).toHaveBeenCalledTimes(1)
    })

    it("usa la cuenta bancaria seleccionada aunque la pantalla envie una cuenta vouchers anterior", async () => {
      const instance = withSapRows()
      await instance.createIrvineDinelcoDeposit(actor, { ...request, voucherAccount: "CUENTA_ANTERIOR" })
      expect(instance.createSapTarjetasDeposit.mock.calls[0][1].voucherAccount).toBe("BANCO_IRVINE")
    })

    it.each([
      ["CreditAcct ausente", rows.map(({ AbsId, CreditSum }) => ({ AbsId, CreditSum }))],
      ["CreditAcct vacio", rows.map((row) => ({ ...row, CreditAcct: null }))],
      ["cuentas CreditAcct diferentes", [rows[0], rows[1], { ...rows[2], CreditAcct: "OTRA_CUENTA" }]]
    ])("permite el deposito con %s y usa la cuenta bancaria", async (_label, sapRows) => {
      const instance = withSapRows(sapRows)
      await instance.createIrvineDinelcoDeposit(actor, request)
      const [, resolved, options] = instance.createSapTarjetasDeposit.mock.calls[0]
      expect(instance.buildSapTarjetasDepositPayload(resolved, options)).toMatchObject({
        DepositAccount: "BANCO_IRVINE", VoucherAccount: "BANCO_IRVINE",
        Commission: 6356, CommissionAccount: "6.01.03.001.008"
      })
    })

    it("coincide con el payload de Ocho A al usar la misma cuenta bancaria", async () => {
      const instance = withSapRows()
      const createSapTarjetasDeposit = jest.fn().mockResolvedValue({})
      const ochoA = new OchoASapTarjetasService({ createSapTarjetasDeposit } as unknown as SapErpService, {
        findOne: jest.fn().mockResolvedValue({ creditCommissionAccount: "6.01.03.001.008" })
      } as never)
      await ochoA.createCreditDeposit({ ...actor, companyCode: "OCHO_A" }, request)
      const [, ochoARequest, ochoAOptions] = createSapTarjetasDeposit.mock.calls[0]
      const ochoAPayload = instance.buildSapTarjetasDepositPayload(ochoARequest, ochoAOptions)
      await instance.createIrvineDinelcoDeposit(actor, request)
      const [, resolved, options] = instance.createSapTarjetasDeposit.mock.calls[0]
      const dinelcoPayload = instance.buildSapTarjetasDepositPayload(resolved, options)
      expect(dinelcoPayload.VoucherAccount).toBe(ochoAPayload.VoucherAccount)
      expect(dinelcoPayload.DepositAccount).toBe(ochoAPayload.DepositAccount)
      expect(dinelcoPayload.VoucherAccount).toBe("BANCO_IRVINE")
    })

    it.each([
      ["un voucher ausente", rows.slice(0, 2)],
      ["un AbsId diferente", [rows[0], rows[1], { ...rows[2], AbsId: 104 }]],
      ["un bruto diferente", [rows[0], rows[1], { ...rows[2], CreditSum: 63570 }]]
    ])("rechaza %s antes de crear el deposito", async (_label, sapRows) => {
      const instance = withSapRows(sapRows)
      await expect(instance.createIrvineDinelcoDeposit(actor, request)).rejects.toBeInstanceOf(BadRequestException)
      expect(instance.createSapTarjetasDeposit).not.toHaveBeenCalled()
      expect(instance.disconnectSapHana).toHaveBeenCalledTimes(1)
    })
  })

  it("cruza juntas las operaciones de debito y credito usando Fecha Venta", () => {
    const instance = service()
    const details = [
      { reference: "721012", gross: 60000, net: 58680, kind: "DEBITO" },
      { reference: "400726", gross: 75000, net: 73350, kind: "DEBITO" },
      { reference: "222808", gross: 65000, net: 61614, kind: "CREDITO" }
    ]
    const bankRows = instance.convertSapB1TableToPreviewRows({
      columns: ["Referencia", "Fecha", "Fecha Venta", "Fecha Acreditación", "Importe", "Monto Neto", "Tipo de tarjeta"],
      rows: details.map((row) => ({
        Referencia: row.reference, Fecha: "2026-09-17", "Fecha Venta": "2026-09-17",
        "Fecha Acreditación": "2026-09-18", Importe: row.gross,
        "Monto Neto": row.net, "Tipo de tarjeta": row.kind
      }))
    })
    const systemRows = instance.convertSapB1TableToPreviewRows({
      columns: ["Referencia", "Fecha", "Importe"],
      rows: details.map((row) => ({ Referencia: row.reference, Fecha: "2026-09-17", Importe: row.gross }))
    })
    const columns = instance.classifySapB1MatchColumns(["Referencia", "Fecha", "Importe"])
    const matches = instance.calculateSapB1SmartMatches(systemRows, bankRows, columns, "like", true)

    expect(matches).toHaveLength(3)
    expect(matches.every((match: { column2Match: boolean }) => match.column2Match)).toBe(true)
    expect(matches[2].bankRow.values["Tipo de tarjeta"]).toBe("CREDITO")
  })

  describe("matching por fecha de venta e importe con referencia distinta", () => {
    function comparison(): CompareSapB1QueryPreviewDto {
      return {
        companyErpConfigId: 2,
        columns: ["Referencia", "Fecha", "Importe"],
        bank: {
          columns: ["Referencia", "Fecha", "Fecha Venta", "Fecha Acreditación", "Importe", "Monto", "Monto Neto"],
          rows: [{
            Referencia: "062133", Fecha: "2026-09-18", "Fecha Venta": "2026-09-17",
            "Fecha Acreditación": "2026-09-18", Importe: 65000, Monto: 65000, "Monto Neto": 63570
          }]
        },
        system: {
          columns: ["AbsId", "Referencia", "Fecha", "Importe"],
          rows: [{ AbsId: 52979, Referencia: "0621133", Fecha: "2026-09-17", Importe: 65000 }]
        }
      }
    }

    it("cruza 062133 con 0621133 por venta del 17 y bruto 65000", async () => {
      const result = await service().compareIrvineDinelcoQueryPreview(actor, comparison())
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0]).toMatchObject({
        systemRow: { values: { AbsId: "52979", Referencia: "0621133" } },
        bankRow: { values: { Referencia: "062133", Fecha: "2026-09-17", "Fecha Acreditación": "2026-09-18" } },
        matchReason: "date_amount", column1Match: false, column2Match: true,
        column3Match: true, dateDifferenceDays: 0
      })
      expect(result.metrics.matches).toBe(1)
      expect(result.unmatchedBankRows).toHaveLength(0)
      expect(result.unmatchedSystemRows).toHaveLength(0)
    })

    it.each([false, true])("resuelve el caso real con dos ventas de 65000, orden invertido %s", async (reverse) => {
      const request = comparison()
      request.bank.rows[0]["Nombre Sucursal"] = "FUEGO GUARANI MRA"
      request.bank.rows.push({
        ...request.bank.rows[0], Referencia: "222808", "Monto Neto": 61614,
        "Nombre Sucursal": "FUEGO GUARANI"
      })
      request.bank.columns.push("Nombre Sucursal")
      if (reverse) request.bank.rows.reverse()
      request.system.rows[0].Fecha = "17/09/2026"
      request.system.rows[0].Importe = "65.000,000"
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0]).toMatchObject({
        bankRow: { values: { Referencia: "062133", Monto: "65000", "Monto Neto": "63570" } },
        systemRow: { values: { AbsId: "52979", Referencia: "0621133" } },
        matchReason: "date_amount", dateDifferenceDays: 0
      })
      expect(result.unmatchedBankRows.map((row: { values: { Referencia: string } }) => row.values.Referencia)).toEqual(["222808"])
    })

    it("compara Monto bruto aunque el alias Importe contenga el neto", async () => {
      const request = comparison()
      request.bank.rows[0].Importe = 63570
      request.bank.rows[0].Monto = "65.000,000"
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].bankRow.values.Importe).toBe("65.000,000")
    })

    it("no cruza el neto 63570 contra SAP cuando Monto bruto es 65000", async () => {
      const request = comparison()
      request.system.rows[0].Importe = 63570
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(0)
    })

    it.each([
      ["2026-09-18", 65000],
      ["2026-09-17", 64999],
      ["", 65000],
      ["2026-09-17", null]
    ])("rechaza el respaldo con Fecha SAP %s e importe %s", async (date, amount) => {
      const request = comparison()
      request.system.rows[0].Fecha = date
      request.system.rows[0].Importe = amount
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(0)
    })

    it.each(["bank", "system"] as const)("deja la ambiguedad del lado %s para seleccion manual", async (side) => {
      const request = comparison()
      request[side].rows.push({ ...request[side].rows[0], AbsId: 52980 })
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(0)
    })

    it("no elige entre dos referencias distintas con un error de un caracter", async () => {
      const request = comparison()
      request.bank.rows.push({ ...request.bank.rows[0], Referencia: "0621134" })
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(0)
    })

    it("resuelve primero referencias correctas sin consumir sus filas en el respaldo", async () => {
      const request = comparison()
      request.bank.rows.push({ ...request.bank.rows[0], Referencia: "777777" })
      request.system.rows.push({ ...request.system.rows[0], AbsId: 52980, Referencia: "777777" })
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(2)
      expect(result.matches[0]).toMatchObject({
        matchReason: "reference", bankRow: { values: { Referencia: "777777" } }
      })
      expect(result.matches[1]).toMatchObject({
        matchReason: "date_amount", bankRow: { values: { Referencia: "062133" } }
      })
      expect(new Set(result.matches.map((match: { bankRow: { rowId: string } }) => match.bankRow.rowId)).size).toBe(2)
    })

    it.each(["excludedBankRowIds", "excludedSystemRowIds"] as const)("respeta %s de las filas ya cruzadas", async (field) => {
      const request = { ...comparison(), [field]: ["sap-b1-0"] }
      const result = await service().compareIrvineDinelcoQueryPreview(actor, request)
      expect(result.matches).toHaveLength(0)
    })

    it("exige Fecha Venta valida para no comparar por acreditacion", async () => {
      const request = comparison()
      delete request.bank.rows[0]["Fecha Venta"]
      await expect(service().compareIrvineDinelcoQueryPreview(actor, request)).rejects.toBeInstanceOf(BadRequestException)
    })

    it("exige Monto bruto en lugar de usar Monto Neto", async () => {
      const request = comparison()
      delete request.bank.rows[0].Monto
      await expect(service().compareIrvineDinelcoQueryPreview(actor, request)).rejects.toBeInstanceOf(BadRequestException)
    })

    it.each(["IRVINE", "FG_TARJETA_QA", "OCHO_A"])("conserva el matching estricto de la ruta generica para %s", async (companyCode) => {
      const request = comparison()
      request.bank.rows[0].Fecha = "2026-09-17"
      const result = await service().compareSapB1QueryPreview({ ...actor, companyCode }, {
        ...request, referenceMatchMode: "like", strictReferenceAmountMatch: true
      })
      expect(result.matches).toHaveLength(0)
    })

    it("rechaza la fachada Dinelco para otras empresas", async () => {
      const instance = service()
      await expect(instance.compareIrvineDinelcoQueryPreview({
        ...actor, companyCode: "OCHO_A"
      }, comparison())).rejects.toBeInstanceOf(BadRequestException)
      expect(instance.requireConfigForActor).not.toHaveBeenCalled()
    })

    it("rechaza una configuracion ERP ajena a Irvine", async () => {
      const instance = service()
      instance.requireConfigForActor.mockResolvedValue({ company: { id: 99 } })
      await expect(instance.compareIrvineDinelcoQueryPreview(actor, comparison())).rejects.toBeInstanceOf(ForbiddenException)
    })
  })
})
