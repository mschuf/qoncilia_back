import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompanyCardCreditCommissionConfig } from "../entities/company-card-credit-commission-config.entity"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { RunSapTarjetasQueryDto } from "./dto/run-sap-tarjetas-query.dto"
import { SendOchoAUenoDepositDto } from "./dto/send-ocho-a-ueno-deposit.dto"
import { SendSapTarjetasDepositDto } from "./dto/send-sap-tarjetas-deposit.dto"
import { parseOchoAUenoTarjetas, UENO_COLUMNS } from "./ocho-a-ueno-tarjetas.util"
import { SapErpService } from "./sap-erp.service"

type SapTarjetasUploadFile = {
  buffer: Buffer
  originalname: string
}

const UENO_DEFAULT_JOURNAL_REMARKS = "COMPRA P.O.S UENO"
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Punto de extension exclusivo de OCHO_A. Inicialmente delega al flujo que ya
// esta validado; las reglas futuras de 8A se implementan aqui sin modificar el
// servicio estandar de Pago de tarjeta.
@Injectable()
export class OchoASapTarjetasService {
  constructor(
    private readonly sapErpService: SapErpService,
    @InjectRepository(CompanyCardCreditCommissionConfig)
    private readonly commissionConfigRepository: Repository<CompanyCardCreditCommissionConfig>
  ) {}

  loginSapSession(actor: AuthUser, payload: SapLoginDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.loginSapSession(actor, payload)
  }

  getSapSessionStatus(actor: AuthUser, companyErpConfigId: number) {
    this.ensureOchoA(actor)
    return this.sapErpService.getSapSessionStatus(actor, companyErpConfigId, true)
  }

  logoutSapSession(actor: AuthUser, payload: SapLogoutDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.logoutSapSession(actor, payload.companyErpConfigId)
  }

  compareQueryPreview(actor: AuthUser, payload: CompareSapB1QueryPreviewDto) {
    this.ensureOchoA(actor)
    // Solo Crédito OCHO_A compara Fecha SAP contra Fecha de venta del CSV con
    // igualdad exacta. Débito conserva su comportamiento actual.
    return this.sapErpService.compareSapB1QueryPreview(
      actor,
      payload,
      payload.cardPaymentKind === "credit"
        ? { requireExactDateMatch: true }
        : undefined
    )
  }

  runSystemQuery(actor: AuthUser, payload: RunSapTarjetasQueryDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.runSapTarjetasSystemQuery(actor, payload)
  }

  parseCsv(actor: AuthUser, companyErpConfigId: number, file: SapTarjetasUploadFile) {
    this.ensureOchoA(actor)
    return this.sapErpService.parseSapTarjetasCsv(actor, companyErpConfigId, file, {
      includeSaleDate: true
    })
  }

  createDebitDeposit(actor: AuthUser, payload: SendSapTarjetasDepositDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.createSapTarjetasDeposit(actor, payload)
  }

  async createCreditDeposit(actor: AuthUser, payload: SendSapTarjetasDepositDto) {
    this.ensureOchoA(actor)
    if (payload.commission === undefined) {
      throw new BadRequestException(
        "No se pudo calcular la comision del deposito de credito de OCHO A."
      )
    }

    const commissionAccount = await this.requireCreditCommissionAccount(actor, payload)
    return this.sapErpService.createSapTarjetasDeposit(actor, payload, {
      commission: {
        account: commissionAccount,
        amount: payload.commission
      },
      bankReference: payload.bankReference
    })
  }

  // === Tarjeta UENO =========================================================
  // La busqueda filtra Fecha de Acreditacion del Excel, pero los vouchers OCRH
  // llevan la fecha de venta: SAP se consulta cubriendo ambos rangos y se
  // devuelve el rango original para filtrar el Excel.
  async runUenoSystemQuery(actor: AuthUser, payload: RunSapTarjetasQueryDto) {
    this.ensureOchoA(actor)
    if (new Date(payload.dateFrom).getTime() > new Date(payload.dateTo).getTime()) {
      throw new BadRequestException("Fecha Desde no puede ser mayor a Fecha Hasta.")
    }
    if (
      Boolean(payload.saleDateFrom) !== Boolean(payload.saleDateTo) ||
      (payload.saleDateFrom &&
        payload.saleDateTo &&
        new Date(payload.saleDateFrom).getTime() > new Date(payload.saleDateTo).getTime())
    ) {
      throw new BadRequestException("UENO: el rango de Fecha de venta es invalido.")
    }
    const dates = [payload.dateFrom, payload.dateTo, payload.saleDateFrom, payload.saleDateTo]
      .filter((date): date is string => Boolean(date))
      .map((date) => date.slice(0, 10))
      .sort()
    const result = await this.sapErpService.runSapTarjetasSystemQuery(actor, {
      ...payload,
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1]
    })
    return { ...result, dateFrom: payload.dateFrom, dateTo: payload.dateTo }
  }

  parseUeno(actor: AuthUser, companyErpConfigId: number, file: SapTarjetasUploadFile) {
    this.ensureOchoA(actor)
    return this.sapErpService.parseSapTarjetasProcessorFile(
      actor,
      companyErpConfigId,
      file,
      parseOchoAUenoTarjetas,
      "ueno.xlsx"
    )
  }

  // Match automatico UENO: Codigo de autorizacion (contenido) + Monto bruto
  // exacto + Fecha de venta igual a la Fecha SAP. Los alias se recalculan desde
  // las columnas originales del Excel.
  compareUenoQueryPreview(actor: AuthUser, payload: CompareSapB1QueryPreviewDto) {
    this.ensureOchoA(actor)
    const rows = payload.bank.rows.map((row, index) => {
      const authorization = String(row[UENO_COLUMNS.authorization] ?? "").trim()
      const saleDate = String(row[UENO_COLUMNS.saleDate] ?? "").trim().slice(0, 10)
      const gross = Number(row[UENO_COLUMNS.grossAmount])
      if (!authorization || !ISO_DATE.test(saleDate) || !Number.isFinite(gross) || gross <= 0) {
        throw new BadRequestException(
          `UENO: la fila ${index + 1} no tiene Codigo de autorizacion, Fecha de venta o Monto bruto validos. Vuelve a cargar el Excel.`
        )
      }
      return { ...row, Referencia: authorization, Fecha: saleDate, Importe: gross }
    })
    return this.sapErpService.compareSapB1QueryPreview(
      actor,
      {
        ...payload,
        bank: {
          columns: [...new Set([...payload.bank.columns, "Referencia", "Fecha", "Importe"])],
          rows
        },
        columns: ["Referencia", "Fecha", "Importe"],
        referenceMatchMode: "like",
        strictReferenceAmountMatch: true,
        groupSystemMatches: false
      },
      { requireExactDateMatch: true }
    )
  }

  // Un deposito por lote UENO. REF = Nro. de comprobante de pago, DepositDate =
  // Fecha de Acreditacion y comision = Monto bruto - Monto neto del lote.
  async createUenoDeposit(actor: AuthUser, payload: SendOchoAUenoDepositDto) {
    this.ensureOchoA(actor)
    const bankReference = payload.bankReference?.trim()
    if (!bankReference) {
      throw new BadRequestException(
        "UENO: falta el Nro. de comprobante de pago (REF) del deposito."
      )
    }
    if (!payload.uenoCardType?.trim()) {
      throw new BadRequestException("UENO: falta el Tipo de tarjeta del deposito.")
    }
    const gross = payload.uenoGrossAmount
    const net = payload.uenoNetAmount
    if (!Number.isFinite(gross) || !Number.isFinite(net) || gross <= 0 || net <= 0 || net > gross) {
      throw new BadRequestException("UENO: Monto bruto, Monto neto y comision no cuadran.")
    }
    const commission = Number((gross - net).toFixed(6))
    if (
      payload.commission !== undefined &&
      Math.abs(payload.commission - commission) > 0.0001
    ) {
      throw new BadRequestException("UENO: Monto bruto, Monto neto y comision no cuadran.")
    }

    await this.sapErpService.validateSapTarjetasVoucherGross(
      actor,
      payload.companyErpConfigId,
      payload.creditLines.map((line) => line.absId),
      gross,
      "UENO"
    )
    // Lotes de prueba sin comision (bruto = neto) se depositan sin cabecera de
    // comision, igual que un deposito de debito.
    const commissionAccount =
      commission > 0 ? await this.requireCreditCommissionAccount(actor, payload) : null

    return this.sapErpService.createSapTarjetasDeposit(
      actor,
      {
        ...payload,
        journalRemarks: payload.journalRemarks?.trim() || UENO_DEFAULT_JOURNAL_REMARKS,
        commission: commissionAccount ? commission : undefined
      },
      {
        bankReference,
        ...(commissionAccount
          ? { commission: { account: commissionAccount, amount: commission } }
          : {})
      }
    )
  }

  private async requireCreditCommissionAccount(
    actor: AuthUser,
    payload: SendSapTarjetasDepositDto
  ): Promise<string> {
    const configuration = await this.commissionConfigRepository.findOne({
      where: {
        active: true,
        companyErpConfig: {
          id: payload.companyErpConfigId,
          company: { id: actor.companyId }
        }
      }
    })
    const account = configuration?.creditCommissionAccount?.trim()

    if (!account) {
      throw new BadRequestException(
        "Configura la cuenta de comision de credito para la ERP SAP_TARJETAS de OCHO A antes de enviar el deposito."
      )
    }

    return account
  }

  private ensureOchoA(actor: AuthUser): void {
    if (actor.companyCode.trim().toUpperCase() !== "OCHO_A") {
      throw new ForbiddenException("Este modulo de Pago de tarjeta es exclusivo de OCHO A.")
    }
  }
}
