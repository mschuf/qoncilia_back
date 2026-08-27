import { ForbiddenException, Injectable } from "@nestjs/common"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { RunSapB1QueryPreviewDto } from "./dto/run-sap-b1-query-preview.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { SendSapExternalReconciliationDto } from "./dto/send-sap-external-reconciliation.dto"
import { SapErpService } from "./sap-erp.service"

@Injectable()
export class FgSapBankService {
  constructor(private readonly sapErpService: SapErpService) {}

  loginSapSession(actor: AuthUser, payload: SapLoginDto) {
    this.ensureFgBankQa(actor)
    return this.sapErpService.loginSapSession(actor, payload)
  }

  getSapSessionStatus(actor: AuthUser, companyErpConfigId: number) {
    this.ensureFgBankQa(actor)
    return this.sapErpService.getSapSessionStatus(actor, companyErpConfigId, true)
  }

  logoutSapSession(actor: AuthUser, payload: SapLogoutDto) {
    this.ensureFgBankQa(actor)
    return this.sapErpService.logoutSapSession(actor, payload.companyErpConfigId)
  }

  runQueryPreview(actor: AuthUser, payload: RunSapB1QueryPreviewDto) {
    this.ensureFgBankQa(actor)
    return this.sapErpService.runSapB1QueryPreview(actor, payload)
  }

  compareQueryPreview(actor: AuthUser, payload: CompareSapB1QueryPreviewDto) {
    this.ensureFgBankQa(actor)
    return this.sapErpService.compareSapB1QueryPreview(
      actor,
      {
        ...payload,
        groupSystemMatches: true
      },
      { allowGroupedSystemMatches: true }
    )
  }

  reconcileExternal(actor: AuthUser, payload: SendSapExternalReconciliationDto) {
    this.ensureFgBankQa(actor)
    return this.sapErpService.reconcileExternal(actor, payload)
  }

  private ensureFgBankQa(actor: AuthUser): void {
    if (!new Set(["5629621_QA", "5629621"]).has(actor.companyCode.trim().toUpperCase())) {
      throw new ForbiddenException(
        "Este modulo SAP de conciliacion bancaria FG esta habilitado solamente para empresas FG autorizadas."
      )
    }
  }
}
