import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { CurrentUser } from "../common/decorators/current-user.decorator"
import { RequiredModule } from "../common/decorators/required-module.decorator"
import { Roles } from "../common/decorators/roles.decorator"
import { AppModuleCode } from "../common/enums/app-module-code.enum"
import { Role } from "../common/enums/role.enum"
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard"
import { ModuleAccessGuard } from "../common/guards/module-access.guard"
import { RolesGuard } from "../common/guards/roles.guard"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto"
import { ConciliationKpiQueryDto } from "./dto/conciliation-kpi-query.dto"
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto"
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto"
import { FgConciliationService } from "./fg-conciliation.service"

type UploadedMemoryFile = {
  buffer: Buffer
  originalname: string
}

@Controller("conciliation/fg")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class FgConciliationController {
  constructor(private readonly fgConciliationService: FgConciliationService) {}

  @Get("catalog")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG, AppModuleCode.BANK_CONCILIATION_FG)
  listCatalog(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.fgConciliationService.listCatalog(actor, query.userId)
  }

  @Post("bank-statements/preview")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  previewBankStatement(
    @Body() body: PreviewBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.fgConciliationService.previewBankStatement(actor, body, file)
  }

  @Post("bank-statements")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  createBankStatement(
    @Body() body: CreateBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.fgConciliationService.createBankStatement(actor, body, file)
  }

  @Post("bank-statements/process-sap-b1")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  processBankStatementWithSapB1(
    @Body() body: CreateBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.fgConciliationService.processBankStatementWithSapB1(actor, body, file)
  }

  @Get("bank-statements/sap-b1-config")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG)
  getSapB1BankStatementConfigStatus(
    @CurrentUser() actor: AuthUser,
    @Query() query: ConciliationKpiQueryDto
  ) {
    return this.fgConciliationService.getSapB1BankStatementConfigStatus(actor, query.userId)
  }

  @Get("bank-statements")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG, AppModuleCode.BANK_CONCILIATION_FG)
  listBankStatements(@CurrentUser() actor: AuthUser, @Query() query: ListBankStatementsQueryDto) {
    return this.fgConciliationService.listBankStatements(actor, query)
  }

  @Get("bank-statements/:id")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG, AppModuleCode.BANK_CONCILIATION_FG)
  getBankStatement(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.fgConciliationService.getBankStatement(actor, id)
  }

  @Delete("bank-statements/:id")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_FG)
  deleteBankStatement(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.fgConciliationService.deleteBankStatement(actor, id)
  }

  @Post("compare-bank-statement")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.BANK_CONCILIATION_FG)
  @UseInterceptors(FileInterceptor("systemFile", { limits: { fileSize: 10 * 1024 * 1024 } }))
  compareBankStatement(
    @Body() body: CompareBankStatementDto,
    @UploadedFile() systemFile: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.fgConciliationService.compareBankStatement(actor, body, systemFile)
  }
}

