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
import { SendSapDepositDto } from "../dto/send-sap-deposit.dto"
import { ErpService } from "../erp.service"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { SapSessionStatusQueryDto } from "./dto/sap-session-status-query.dto"

@Controller("erp/sap")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiredModule(AppModuleCode.ERP_MANAGEMENT)
export class SapErpController {
  constructor(private readonly erpService: ErpService) {}

  @Post("sessions/login")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  login(@Body() body: SapLoginDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.loginSapSession(actor, body)
  }

  @Get("sessions/status")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  status(@Query() query: SapSessionStatusQueryDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.getSapSessionStatus(actor, query.companyErpConfigId, true)
  }

  @Post("sessions/logout")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  logout(@Body() body: SapLogoutDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.logoutSapSession(actor, body.companyErpConfigId)
  }

  @Post("deposits")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  sendDeposit(@Body() body: SendSapDepositDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.sendSapDeposit(actor, body)
  }
}
