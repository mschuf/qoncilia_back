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
  UseGuards
} from "@nestjs/common"
import { CurrentUser } from "../common/decorators/current-user.decorator"
import { RequiredModule } from "../common/decorators/required-module.decorator"
import { Roles } from "../common/decorators/roles.decorator"
import { AppModuleCode } from "../common/enums/app-module-code.enum"
import { Role } from "../common/enums/role.enum"
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard"
import { ModuleAccessGuard } from "../common/guards/module-access.guard"
import { RolesGuard } from "../common/guards/roles.guard"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { CopyCompanyErpConfigDto } from "./dto/copy-company-erp-config.dto"
import { CreateCompanyErpConfigDto } from "./dto/create-company-erp-config.dto"
import { CreateErpConfigTemplateDto } from "./dto/create-erp-config-template.dto"
import { ListCompanyErpConfigsQueryDto } from "./dto/list-company-erp-configs-query.dto"
import { UpdateCompanyErpConfigDto } from "./dto/update-company-erp-config.dto"
import { UpdateErpConfigTemplateDto } from "./dto/update-erp-config-template.dto"
import { ErpService } from "./erp.service"

@Controller("erp")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class ErpController {
  constructor(private readonly erpService: ErpService) {}

  @Get("reference")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT, AppModuleCode.CONCILIATION)
  listReference(@CurrentUser() actor: AuthUser) {
    return this.erpService.listReference(actor)
  }

  @Get("configs")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT, AppModuleCode.CONCILIATION)
  listCompanyErpConfigs(@CurrentUser() actor: AuthUser, @Query() query: ListCompanyErpConfigsQueryDto) {
    return this.erpService.listCompanyErpConfigs(actor, query)
  }

  @Get("config-templates")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  listErpConfigTemplates(@CurrentUser() actor: AuthUser) {
    return this.erpService.listErpConfigTemplates(actor)
  }

  @Post("config-templates")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  createErpConfigTemplate(@Body() body: CreateErpConfigTemplateDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.createErpConfigTemplate(body, actor)
  }

  @Post("config-templates/:templateId/copies")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  copyErpConfigTemplate(
    @Param("templateId", ParseIntPipe) templateId: number,
    @Body() body: CopyCompanyErpConfigDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.copyErpConfigTemplate(templateId, body, actor)
  }

  @Patch("config-templates/:templateId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  updateErpConfigTemplate(
    @Param("templateId", ParseIntPipe) templateId: number,
    @Body() body: UpdateErpConfigTemplateDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.updateErpConfigTemplate(templateId, body, actor)
  }

  @Delete("config-templates/:templateId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  deleteErpConfigTemplate(
    @Param("templateId", ParseIntPipe) templateId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.deleteErpConfigTemplate(templateId, actor)
  }

  @Post("configs")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  createCompanyErpConfig(@Body() body: CreateCompanyErpConfigDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.createCompanyErpConfig(body, actor)
  }

  @Post("configs/:configId/copies")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  copyCompanyErpConfig(
    @Param("configId", ParseIntPipe) configId: number,
    @Body() body: CopyCompanyErpConfigDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.copyCompanyErpConfig(configId, body, actor)
  }

  @Patch("configs/:configId")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  updateCompanyErpConfig(
    @Param("configId", ParseIntPipe) configId: number,
    @Body() body: UpdateCompanyErpConfigDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.updateCompanyErpConfig(configId, body, actor)
  }

  @Delete("configs/:configId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  deleteCompanyErpConfig(
    @Param("configId", ParseIntPipe) configId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.deleteCompanyErpConfig(configId, actor)
  }
}
