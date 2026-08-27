import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompanyCardCreditCommissionConfig } from "../entities/company-card-credit-commission-config.entity"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { RunSapTarjetasQueryDto } from "./dto/run-sap-tarjetas-query.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { SendSapTarjetasDepositDto } from "./dto/send-sap-tarjetas-deposit.dto"
import { SapErpService } from "./sap-erp.service"

type SapTarjetasUploadFile = {
  buffer: Buffer
  originalname: string
}

@Injectable()
export class FgSapTarjetasService {
  constructor(
    private readonly sapErpService: SapErpService,
    @InjectRepository(CompanyCardCreditCommissionConfig)
    private readonly commissionConfigRepository: Repository<CompanyCardCreditCommissionConfig>
  ) {}

  loginSapSession(actor: AuthUser, payload: SapLoginDto) {
    this.ensureFgTarjetasQa(actor)
    return this.sapErpService.loginSapSession(actor, payload)
  }

  getSapSessionStatus(actor: AuthUser, companyErpConfigId: number) {
    this.ensureFgTarjetasQa(actor)
    return this.sapErpService.getSapSessionStatus(actor, companyErpConfigId, true)
  }

  logoutSapSession(actor: AuthUser, payload: SapLogoutDto) {
    this.ensureFgTarjetasQa(actor)
    return this.sapErpService.logoutSapSession(actor, payload.companyErpConfigId)
  }

  compareQueryPreview(actor: AuthUser, payload: CompareSapB1QueryPreviewDto) {
    this.ensureFgTarjetasQa(actor)
    const isFgQaCredit =
      actor.companyCode.trim().toUpperCase() === "FG_TARJETA_QA" &&
      payload.cardPaymentKind === "credit"

    if (!isFgQaCredit) {
      return this.sapErpService.compareSapB1QueryPreview(actor, payload)
    }

    // La primera pasada conserva el matching vigente por Codigo de autorizacion.
    // Solo las filas restantes pueden usar Nro. transaccion como respaldo.
    return this.sapErpService.compareSapB1QueryPreview(
      actor,
      {
        ...payload,
        referenceMatchMode: "like",
        strictReferenceAmountMatch: true
      },
      { fgCreditCardTransactionFallback: true }
    )
  }

  runSystemQuery(actor: AuthUser, payload: RunSapTarjetasQueryDto) {
    this.ensureFgTarjetasQa(actor)
    if (actor.companyCode.trim().toUpperCase() !== "FG_TARJETA_QA") {
      return this.sapErpService.runSapTarjetasSystemQuery(actor, payload)
    }

    return this.sapErpService.runSapTarjetasSystemQuery(actor, payload, {
      includeCreditVoucherAccount: true
    })
  }

  parseCsv(actor: AuthUser, companyErpConfigId: number, file: SapTarjetasUploadFile) {
    this.ensureFgTarjetasQa(actor)
    return this.sapErpService.parseSapTarjetasCsv(actor, companyErpConfigId, file, {
      includeSaleDate: true
    })
  }

  createDebitDeposit(actor: AuthUser, payload: SendSapTarjetasDepositDto) {
    this.ensureFgTarjetasQa(actor)
    this.ensureRequiredFgBankHeaders(payload)
    return this.sapErpService.createSapTarjetasDeposit(actor, payload)
  }

  async createCreditDeposit(actor: AuthUser, payload: SendSapTarjetasDepositDto) {
    this.ensureFgTarjetasQa(actor)
    this.ensureRequiredFgBankHeaders(payload)
    if (
      actor.companyCode.trim().toUpperCase() === "FG_TARJETA_QA" &&
      !payload.voucherAccount?.trim()
    ) {
      throw new BadRequestException(
        "No se encontro la Cuenta vouchers SAP (OCRH.CreditAcct) para este deposito de credito FG QA. Ejecuta nuevamente la consulta del sistema."
      )
    }
    if (payload.commission === undefined) {
      throw new BadRequestException(
        "No se pudo calcular la comision del deposito de credito de FG."
      )
    }

    const commissionAccount = await this.requireCreditCommissionAccount(actor, payload)
    const depositOptions = {
      commission: {
        account: commissionAccount,
        amount: payload.commission
      }
    }

    if (actor.companyCode.trim().toUpperCase() === "FG_TARJETA_QA") {
      // El credito FG QA debe solicitar la conciliacion automatica al crear
      // el deposito, usando la cuenta de vouchers recibida desde OCRH.
      return this.sapErpService.createSapTarjetasDeposit(actor, payload, {
        ...depositOptions,
        reconcileAfterDeposit: "tYES"
      })
    }

    return this.sapErpService.createSapTarjetasDeposit(actor, payload, depositOptions)
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

    if (!account || account === "PENDIENTE_CONFIGURAR_CUENTA_COMISION_FG") {
      throw new BadRequestException(
        "Configura la cuenta de comision de credito para la ERP SAP_TARJETAS de FG antes de enviar el deposito."
      )
    }

    return account
  }

  private ensureRequiredFgBankHeaders(payload: SendSapTarjetasDepositDto): void {
    if (!payload.bank?.trim()) {
      throw new BadRequestException(
        "El deposito FG requiere Bank con la descripcion del banco seleccionado."
      )
    }
    if (!payload.bankAccountNum?.trim()) {
      throw new BadRequestException(
        "El deposito FG requiere BankAccountNum desde Cuenta Pago ERP."
      )
    }
  }

  private ensureFgTarjetasQa(actor: AuthUser): void {
    if (!new Set(["FG_TARJETA_QA", "FG_TARJETA"]).has(actor.companyCode.trim().toUpperCase())) {
      throw new ForbiddenException(
        "Este modulo SAP de Pago de tarjeta FG esta habilitado solamente para empresas FG autorizadas."
      )
    }
  }
}
