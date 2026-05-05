import {
  Body,
  Controller,
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
import { CreateCompanyErpConfigDto } from "./dto/create-company-erp-config.dto"
import { ListCompanyErpConfigsQueryDto } from "./dto/list-company-erp-configs-query.dto"
import { UpdateCompanyErpConfigDto } from "./dto/update-company-erp-config.dto"
import { ErpService } from "./erp.service"

@Controller("erp")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class ErpController {
  constructor(private readonly erpService: ErpService) {}

  @Get("reference")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  listReference(@CurrentUser() actor: AuthUser) {
    return this.erpService.listReference(actor)
  }

  @Get("configs")
  @Roles(Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS, Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  listCompanyErpConfigs(@CurrentUser() actor: AuthUser, @Query() query: ListCompanyErpConfigsQueryDto) {
    return this.erpService.listCompanyErpConfigs(actor, query)
  }

  @Post("configs")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  createCompanyErpConfig(@Body() body: CreateCompanyErpConfigDto, @CurrentUser() actor: AuthUser) {
    return this.erpService.createCompanyErpConfig(body, actor)
  }

  @Patch("configs/:configId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  updateCompanyErpConfig(
    @Param("configId", ParseIntPipe) configId: number,
    @Body() body: UpdateCompanyErpConfigDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.erpService.updateCompanyErpConfig(configId, body, actor)
  }
}
