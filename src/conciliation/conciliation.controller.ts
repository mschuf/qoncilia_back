import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiredModule } from "../common/decorators/required-module.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AppModuleCode } from "../common/enums/app-module-code.enum";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { ConciliationKpiQueryDto } from "./dto/conciliation-kpi-query.dto";
import { ApplyTemplateLayoutDto } from "./dto/apply-template-layout.dto";
import { AssignGestorBankDto } from "./dto/assign-gestor-bank.dto";
import { SetBankAvailableTemplatesDto } from "./dto/set-bank-available-templates.dto";
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto";
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto";
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateConciliationSystemDto } from "./dto/create-conciliation-system.dto";
import { CreateLayoutDto } from "./dto/create-layout.dto";
import { CreateTemplateLayoutDto } from "./dto/create-template-layout.dto";
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto";
import { UpdateConciliationSystemDto } from "./dto/update-conciliation-system.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { UpdateLayoutDto } from "./dto/update-layout.dto";
import { UpdateTemplateLayoutDto } from "./dto/update-template-layout.dto";
import { ConciliationService } from "./conciliation.service";

type UploadedMemoryFile = {
  buffer: Buffer;
  originalname: string;
};

type UploadedFilesMap = {
  systemFile?: UploadedMemoryFile[];
  bankFile?: UploadedMemoryFile[];
};

@Controller("conciliation")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class ConciliationController {
  constructor(private readonly conciliationService: ConciliationService) {}

  @Get("catalog")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  listCatalog(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.conciliationService.listCatalog(actor, query.userId);
  }

  @Get(["plantillas-base", "template-layouts"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listTemplateLayouts(@CurrentUser() actor: AuthUser) {
    return this.conciliationService.listTemplateLayouts(actor);
  }

  @Get(["sistemas", "systems"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listSystems(@CurrentUser() actor: AuthUser) {
    return this.conciliationService.listSystems(actor);
  }

  @Post(["sistemas", "systems"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createSystem(@Body() body: CreateConciliationSystemDto, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.createSystem(body, actor);
  }

  @Patch(["sistemas/:systemId", "systems/:systemId"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateSystem(
    @Param("systemId", ParseIntPipe) systemId: number,
    @Body() body: UpdateConciliationSystemDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateSystem(systemId, body, actor);
  }

  @Delete(["sistemas/:systemId", "systems/:systemId"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  deleteSystem(@Param("systemId", ParseIntPipe) systemId: number, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.deleteSystem(systemId, actor);
  }

  @Get("gestor-assignments/catalog")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listGestorAssignmentCatalog(@CurrentUser() actor: AuthUser) {
    return this.conciliationService.listGestorAssignmentCatalog(actor);
  }

  @Post("gestor-assignments/users/:userId/banks/:sourceBankId/sync")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  syncGestorBankAssignment(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("sourceBankId", ParseIntPipe) sourceBankId: number,
    @Body() body: AssignGestorBankDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.syncGestorBankAssignment(
      actor,
      userId,
      sourceBankId,
      body
    );
  }

  @Post(["plantillas-base", "template-layouts"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createTemplateLayout(@Body() body: CreateTemplateLayoutDto, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.createTemplateLayout(body, actor);
  }

  @Patch(["plantillas-base/:plantillaBaseId", "template-layouts/:plantillaBaseId"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateTemplateLayout(
    @Param("plantillaBaseId", ParseIntPipe) plantillaBaseId: number,
    @Body() body: UpdateTemplateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateTemplateLayout(plantillaBaseId, body, actor);
  }

  @Delete(["plantillas-base/:plantillaBaseId", "template-layouts/:plantillaBaseId"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  deleteTemplateLayout(
    @Param("plantillaBaseId", ParseIntPipe) plantillaBaseId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.deleteTemplateLayout(plantillaBaseId, actor);
  }

  @Post("users/:userId/banks")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createUserBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Body() body: CreateBankDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.createUserBank(userId, body, actor);
  }

  @Patch("users/:userId/banks/:bankId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateUserBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: UpdateBankDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateUserBank(userId, bankId, body, actor);
  }

  @Get("users/:userId/banks/:bankId/delete-preview")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  getUserBankDeletionPreview(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.getUserBankDeletionPreview(userId, bankId, actor);
  }

  @Delete("users/:userId/banks/:bankId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  deleteUserBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.deleteUserBank(userId, bankId, actor);
  }

  @Post(["users/:userId/banks/:bankId/plantillas", "users/:userId/banks/:bankId/layouts"])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: CreateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.createLayout(userId, bankId, body, actor);
  }

  @Post([
    "users/:userId/banks/:bankId/plantillas-base/:plantillaBaseId/aplicar",
    "users/:userId/banks/:bankId/template-layouts/:plantillaBaseId/apply"
  ])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  applyTemplateLayoutToBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("plantillaBaseId", ParseIntPipe) plantillaBaseId: number,
    @Body() body: ApplyTemplateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.applyTemplateLayoutToBank(
      userId,
      bankId,
      plantillaBaseId,
      body,
      actor
    );
  }

  @Put([
    "users/:userId/banks/:bankId/plantillas-base/disponibles",
    "users/:userId/banks/:bankId/template-layouts/available"
  ])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  setBankAvailableTemplates(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: SetBankAvailableTemplatesDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.setBankAvailableTemplates(userId, bankId, body, actor);
  }

  @Get([
    "admin/bancos-plantillas-disponibles",
    "admin/banks-with-available-templates"
  ])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listBanksWithAvailableTemplatesForAdmin(@CurrentUser() actor: AuthUser) {
    return this.conciliationService.listBanksWithAvailableTemplatesForAdmin(actor);
  }

  @Post([
    "admin/banks/:bankId/plantillas-base/:plantillaBaseId/aplicar",
    "admin/banks/:bankId/template-layouts/:plantillaBaseId/apply"
  ])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  applyAvailableTemplateAsAdmin(
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("plantillaBaseId", ParseIntPipe) plantillaBaseId: number,
    @Body() body: ApplyTemplateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.applyAvailableTemplateAsAdmin(
      bankId,
      plantillaBaseId,
      body,
      actor
    );
  }

  @Patch([
    "admin/banks/:bankId/layouts/:layoutId/activate",
    "admin/banks/:bankId/plantillas/:layoutId/activate"
  ])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  activateLayoutAsAdmin(
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("layoutId", ParseIntPipe) layoutId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.activateLayoutAsAdmin(bankId, layoutId, actor);
  }

  @Patch([
    "users/:userId/banks/:bankId/plantillas/:plantillaId",
    "users/:userId/banks/:bankId/layouts/:plantillaId"
  ])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("plantillaId", ParseIntPipe) plantillaId: number,
    @Body() body: UpdateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateLayout(userId, bankId, plantillaId, body, actor);
  }

  @Delete([
    "users/:userId/banks/:bankId/plantillas/:plantillaId",
    "users/:userId/banks/:bankId/layouts/:plantillaId"
  ])
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  deleteLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("plantillaId", ParseIntPipe) plantillaId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.deleteLayout(userId, bankId, plantillaId, actor);
  }

  @Get("kpis")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  getKpis(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.conciliationService.getKpis(actor, query.userId);
  }

  @Post(["extractos-bancarios/preview", "bank-statements/preview"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  previewBankStatement(
    @Body() body: PreviewBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.previewBankStatement(actor, body, file);
  }

  @Post(["extractos-bancarios", "bank-statements"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  createBankStatement(
    @Body() body: CreateBankStatementDto,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.createBankStatement(actor, body, file);
  }

  @Get(["extractos-bancarios", "bank-statements"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  listBankStatements(@CurrentUser() actor: AuthUser, @Query() query: ListBankStatementsQueryDto) {
    return this.conciliationService.listBankStatements(actor, query);
  }

  @Get(["extractos-bancarios/:id", "bank-statements/:id"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  getBankStatement(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.getBankStatement(actor, id);
  }

  @Delete(["extractos-bancarios/:id", "bank-statements/:id"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  deleteBankStatement(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.deleteBankStatement(actor, id);
  }

  @Post(["comparar-extracto-bancario", "compare-bank-statement"])
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  @UseInterceptors(
    FileInterceptor("systemFile", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  compareBankStatement(
    @Body() body: CompareBankStatementDto,
    @UploadedFile() systemFile: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.compareBankStatement(actor, body, systemFile);
  }
}
