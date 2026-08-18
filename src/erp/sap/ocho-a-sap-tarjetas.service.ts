import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
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

const OCHO_A_CREDIT_CARD_COMMISSION_ACCOUNT = "1111000104"

// Punto de extension exclusivo de OCHO_A. Inicialmente delega al flujo que ya
// esta validado; las reglas futuras de 8A se implementan aqui sin modificar el
// servicio estandar de Pago de tarjeta.
@Injectable()
export class OchoASapTarjetasService {
  constructor(private readonly sapErpService: SapErpService) {}

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
    return this.sapErpService.compareSapB1QueryPreview(actor, payload)
  }

  runSystemQuery(actor: AuthUser, payload: RunSapTarjetasQueryDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.runSapTarjetasSystemQuery(actor, payload)
  }

  parseCsv(actor: AuthUser, companyErpConfigId: number, file: SapTarjetasUploadFile) {
    this.ensureOchoA(actor)
    return this.sapErpService.parseSapTarjetasCsv(actor, companyErpConfigId, file)
  }

  createDebitDeposit(actor: AuthUser, payload: SendSapTarjetasDepositDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.createSapTarjetasDeposit(actor, payload)
  }

  createCreditDeposit(actor: AuthUser, payload: SendSapTarjetasDepositDto) {
    this.ensureOchoA(actor)
    if (payload.commission === undefined) {
      throw new BadRequestException(
        "No se pudo calcular la comision del deposito de credito de OCHO A."
      )
    }

    return this.sapErpService.createSapTarjetasDeposit(actor, payload, {
      commission: {
        account: OCHO_A_CREDIT_CARD_COMMISSION_ACCOUNT,
        amount: payload.commission
      },
      bankReference: payload.bankReference
    })
  }

  private ensureOchoA(actor: AuthUser): void {
    if (actor.companyCode.trim().toUpperCase() !== "OCHO_A") {
      throw new ForbiddenException("Este modulo de Pago de tarjeta es exclusivo de OCHO A.")
    }
  }
}
