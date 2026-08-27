import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import { RequiredModule } from "../../common/decorators/required-module.decorator"
import { Roles } from "../../common/decorators/roles.decorator"
import { AppModuleCode } from "../../common/enums/app-module-code.enum"
import { Role } from "../../common/enums/role.enum"
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard"
import { ModuleAccessGuard } from "../../common/guards/module-access.guard"
import { RolesGuard } from "../../common/guards/roles.guard"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { RunSapB1QueryPreviewDto } from "./dto/run-sap-b1-query-preview.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { SendSapExternalReconciliationDto } from "./dto/send-sap-external-reconciliation.dto"
import { SapSessionStatusQueryDto } from "./dto/sap-session-status-query.dto"
import { FgSapBankService } from "./fg-sap-bank.service"

@Controller("erp/sap/fg-bank")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiredModule(AppModuleCode.BANK_CONCILIATION_FG)
export class FgSapBankController {
  constructor(private readonly fgSapBankService: FgSapBankService) {}

  @Post("sessions/login")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  login(@Body() body: SapLoginDto, @CurrentUser() actor: AuthUser) {
    return this.fgSapBankService.loginSapSession(actor, body)
  }

  @Get("sessions/status")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  status(@Query() query: SapSessionStatusQueryDto, @CurrentUser() actor: AuthUser) {
    return this.fgSapBankService.getSapSessionStatus(actor, query.companyErpConfigId)
  }

  @Post("sessions/logout")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  logout(@Body() body: SapLogoutDto, @CurrentUser() actor: AuthUser) {
    return this.fgSapBankService.logoutSapSession(actor, body)
  }

  @Post("query-preview")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  runQueryPreview(@Body() body: RunSapB1QueryPreviewDto, @CurrentUser() actor: AuthUser) {
    return this.fgSapBankService.runQueryPreview(actor, body)
  }

  @Post("query-preview/compare")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  compareQueryPreview(
    @Body() body: CompareSapB1QueryPreviewDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.fgSapBankService.compareQueryPreview(actor, body)
  }

  @Post("external-reconciliations")
  @Roles(Role.GESTOR_COBRANZA, Role.ADMIN, Role.IS_SUPER_ADMIN)
  reconcileExternal(
    @Body() body: SendSapExternalReconciliationDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.fgSapBankService.reconcileExternal(actor, body)
  }
}

