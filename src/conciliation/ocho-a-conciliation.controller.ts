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
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiredModule } from "../common/decorators/required-module.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AppModuleCode } from "../common/enums/app-module-code.enum";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto";
import { ConciliationKpiQueryDto } from "./dto/conciliation-kpi-query.dto";
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto";
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto";
import { OchoAConciliationService } from "./ocho-a-conciliation.service";

type UploadedMemoryFile = {
  buffer: Buffer;
  originalname: string;
};

// API independiente de OCHO A. Mantiene las mismas operaciones funcionales de
// los dos modulos bancarios, aisladas de /conciliation para futuras reglas.
@Controller("conciliation/ocho-a")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class OchoAConciliationController {
  constructor(private readonly ochoAConciliationService: OchoAConciliationService) {}

  @Get("catalog")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A, AppModuleCode.BANK_CONCILIATION_OCHO_A)
  listCatalog(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.ochoAConciliationService.listCatalog(actor, query.userId);
  }

  @Post("bank-statements/preview")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  previewBankStatement(
    @Body() body: PreviewBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.ochoAConciliationService.previewBankStatement(actor, body, file);
  }

  @Post("bank-statements")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  createBankStatement(
    @Body() body: CreateBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.ochoAConciliationService.createBankStatement(actor, body, file);
  }

  @Post("bank-statements/process-sap-b1")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  processBankStatementWithSapB1(
    @Body() body: CreateBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.ochoAConciliationService.processBankStatementWithSapB1(actor, body, file);
  }

  @Get("bank-statements/sap-b1-config")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A)
  getSapB1BankStatementConfigStatus(
    @CurrentUser() actor: AuthUser,
    @Query() query: ConciliationKpiQueryDto
  ) {
    return this.ochoAConciliationService.getSapB1BankStatementConfigStatus(actor, query.userId);
  }

  @Get("bank-statements")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A, AppModuleCode.BANK_CONCILIATION_OCHO_A)
  listBankStatements(@CurrentUser() actor: AuthUser, @Query() query: ListBankStatementsQueryDto) {
    return this.ochoAConciliationService.listBankStatements(actor, query);
  }

  @Get("bank-statements/:id")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A, AppModuleCode.BANK_CONCILIATION_OCHO_A)
  getBankStatement(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.ochoAConciliationService.getBankStatement(actor, id);
  }

  @Delete("bank-statements/:id")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION_OCHO_A)
  deleteBankStatement(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.ochoAConciliationService.deleteBankStatement(actor, id);
  }

  @Post("compare-bank-statement")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.BANK_CONCILIATION_OCHO_A)
  @UseInterceptors(FileInterceptor("systemFile", { limits: { fileSize: 10 * 1024 * 1024 } }))
  compareBankStatement(
    @Body() body: CompareBankStatementDto,
    @UploadedFile() systemFile: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.ochoAConciliationService.compareBankStatement(actor, body, systemFile);
  }
}
