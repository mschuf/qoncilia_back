import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompanyCardCreditCommissionConfig } from "../entities/company-card-credit-commission-config.entity"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { RunSapTarjetasQueryDto } from "./dto/run-sap-tarjetas-query.dto"
import { SendSapTarjetasDepositDto } from "./dto/send-sap-tarjetas-deposit.dto"
import { SapErpService } from "./sap-erp.service"

type SapTarjetasUploadFile = {
  buffer: Buffer
  originalname: string
}

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
