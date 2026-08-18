import { ForbiddenException, Injectable } from "@nestjs/common"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { RunSapB1QueryPreviewDto } from "./dto/run-sap-b1-query-preview.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { SendSapExternalReconciliationDto } from "./dto/send-sap-external-reconciliation.dto"
import { SapErpService } from "./sap-erp.service"

// Fachada del Service Layer para Conciliacion de banco de OCHO A. Es el punto
// donde se incorporaran reglas propias sin alterar SAP_B1 para otras empresas.
@Injectable()
export class OchoASapBankService {
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

  runQueryPreview(actor: AuthUser, payload: RunSapB1QueryPreviewDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.runSapB1QueryPreview(actor, payload)
  }

  compareQueryPreview(actor: AuthUser, payload: CompareSapB1QueryPreviewDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.compareSapB1QueryPreview(actor, payload)
  }

  reconcileExternal(actor: AuthUser, payload: SendSapExternalReconciliationDto) {
    this.ensureOchoA(actor)
    return this.sapErpService.reconcileExternal(actor, payload)
  }

  private ensureOchoA(actor: AuthUser): void {
    if (actor.companyCode.trim().toUpperCase() !== "OCHO_A") {
      throw new ForbiddenException("Este modulo SAP de conciliacion bancaria es exclusivo de OCHO A.")
    }
  }
}
