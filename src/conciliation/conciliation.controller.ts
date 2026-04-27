import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateConciliationSystemDto } from "./dto/create-conciliation-system.dto";
import { CreateLayoutDto } from "./dto/create-layout.dto";
import { CreateTemplateLayoutDto } from "./dto/create-template-layout.dto";
import { ListReconciliationsQueryDto } from "./dto/list-reconciliations-query.dto";
import { ParseFileDto } from "./dto/parse-file.dto";
import { PreviewReconciliationDto } from "./dto/preview-reconciliation.dto";
import { SaveReconciliationDto } from "./dto/save-reconciliation.dto";
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

  @Get("template-layouts")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listTemplateLayouts(@CurrentUser() actor: AuthUser) {
    return this.conciliationService.listTemplateLayouts(actor);
  }

  @Get("systems")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listSystems(@CurrentUser() actor: AuthUser) {
    return this.conciliationService.listSystems(actor);
  }

  @Post("systems")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createSystem(@Body() body: CreateConciliationSystemDto, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.createSystem(body, actor);
  }

  @Patch("systems/:systemId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateSystem(
    @Param("systemId", ParseIntPipe) systemId: number,
    @Body() body: UpdateConciliationSystemDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateSystem(systemId, body, actor);
  }

  @Delete("systems/:systemId")
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

  @Post("template-layouts")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createTemplateLayout(@Body() body: CreateTemplateLayoutDto, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.createTemplateLayout(body, actor);
  }

  @Patch("template-layouts/:templateLayoutId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateTemplateLayout(
    @Param("templateLayoutId", ParseIntPipe) templateLayoutId: number,
    @Body() body: UpdateTemplateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateTemplateLayout(templateLayoutId, body, actor);
  }

  @Delete("template-layouts/:templateLayoutId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  deleteTemplateLayout(
    @Param("templateLayoutId", ParseIntPipe) templateLayoutId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.deleteTemplateLayout(templateLayoutId, actor);
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

  @Post("users/:userId/banks/:bankId/layouts")
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

  @Post("users/:userId/banks/:bankId/template-layouts/:templateLayoutId/apply")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  applyTemplateLayoutToBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("templateLayoutId", ParseIntPipe) templateLayoutId: number,
    @Body() body: ApplyTemplateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.applyTemplateLayoutToBank(
      userId,
      bankId,
      templateLayoutId,
      body,
      actor
    );
  }

  @Patch("users/:userId/banks/:bankId/layouts/:layoutId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("layoutId", ParseIntPipe) layoutId: number,
    @Body() body: UpdateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateLayout(userId, bankId, layoutId, body, actor);
  }

  @Delete("users/:userId/banks/:bankId/layouts/:layoutId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  deleteLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("layoutId", ParseIntPipe) layoutId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.deleteLayout(userId, bankId, layoutId, actor);
  }

  @Post("preview")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "systemFile", maxCount: 1 },
        { name: "bankFile", maxCount: 1 }
      ],
      {
        limits: {
          fileSize: 10 * 1024 * 1024
        }
      }
    )
  )
  preview(
    @Body() body: PreviewReconciliationDto,
    @UploadedFiles() files: UploadedFilesMap,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.buildPreview(
      actor,
      body,
      files?.systemFile?.[0],
      files?.bankFile?.[0]
    );
  }

  @Post("reconciliations")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  saveReconciliation(@Body() body: SaveReconciliationDto, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.saveReconciliation(actor, body);
  }

  @Get("reconciliations")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  listReconciliations(@CurrentUser() actor: AuthUser, @Query() query: ListReconciliationsQueryDto) {
    return this.conciliationService.listReconciliations(actor, query);
  }

  @Get("reconciliations/:id")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  getReconciliation(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.getReconciliation(actor, id);
  }

  @Get("kpis")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  getKpis(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.conciliationService.getKpis(actor, query.userId);
  }

  @Post("parse-file")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.CONCILIATION)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  parseFile(
    @Query("userBankId", ParseIntPipe) userBankId: number,
    @Query("layoutId", ParseIntPipe) layoutId: number,
    @Query("source") source: "system" | "bank",
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.parseFile(actor, { userBankId, layoutId, source }, file);
  }
}
