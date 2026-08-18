import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
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
import { ParseSapTarjetasCsvDto } from "./dto/parse-sap-tarjetas-csv.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapLogoutDto } from "./dto/sap-logout.dto"
import { RunSapTarjetasQueryDto } from "./dto/run-sap-tarjetas-query.dto"
import { SapSessionStatusQueryDto } from "./dto/sap-session-status-query.dto"
import { SendSapTarjetasDepositDto } from "./dto/send-sap-tarjetas-deposit.dto"
import { OchoASapTarjetasService } from "./ocho-a-sap-tarjetas.service"

type UploadedMemoryFile = {
  buffer: Buffer
  originalname: string
}

@Controller("erp/sap/ocho-a")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiredModule(AppModuleCode.CARD_PAYMENT_OCHO_A)
export class OchoASapTarjetasController {
  constructor(private readonly ochoASapTarjetasService: OchoASapTarjetasService) {}

  @Post("sessions/login")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  login(@Body() body: SapLoginDto, @CurrentUser() actor: AuthUser) {
    return this.ochoASapTarjetasService.loginSapSession(actor, body)
  }

  @Get("sessions/status")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  status(@Query() query: SapSessionStatusQueryDto, @CurrentUser() actor: AuthUser) {
    return this.ochoASapTarjetasService.getSapSessionStatus(actor, query.companyErpConfigId)
  }

  @Post("sessions/logout")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  logout(@Body() body: SapLogoutDto, @CurrentUser() actor: AuthUser) {
    return this.ochoASapTarjetasService.logoutSapSession(actor, body)
  }

  @Post("query-preview/compare")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  compareQueryPreview(
    @Body() body: CompareSapB1QueryPreviewDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.ochoASapTarjetasService.compareQueryPreview(actor, body)
  }

  @Post("credit-cards/system-query")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  runSystemQuery(@Body() body: RunSapTarjetasQueryDto, @CurrentUser() actor: AuthUser) {
    return this.ochoASapTarjetasService.runSystemQuery(actor, body)
  }

  @Post("credit-cards/parse-csv")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  parseCsv(
    @Body() body: ParseSapTarjetasCsvDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.ochoASapTarjetasService.parseCsv(actor, body.companyErpConfigId, file)
  }

  @Post("credit-cards/deposits/debit")
  @Roles(Role.GESTOR_COBRANZA, Role.ADMIN, Role.IS_SUPER_ADMIN)
  createDebitDeposit(@Body() body: SendSapTarjetasDepositDto, @CurrentUser() actor: AuthUser) {
    return this.ochoASapTarjetasService.createDebitDeposit(actor, body)
  }

  @Post("credit-cards/deposits/credit")
  @Roles(Role.GESTOR_COBRANZA, Role.ADMIN, Role.IS_SUPER_ADMIN)
  createCreditDeposit(@Body() body: SendSapTarjetasDepositDto, @CurrentUser() actor: AuthUser) {
    return this.ochoASapTarjetasService.createCreditDeposit(actor, body)
  }
}
