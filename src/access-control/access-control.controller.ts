import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiredModule } from "../common/decorators/required-module.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AppModuleCode } from "../common/enums/app-module-code.enum";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { AccessControlService } from "./access-control.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UpdateCompanyRoleModulesDto } from "./dto/update-company-role-modules.dto";
import { UpsertOwnCompanyDto } from "./dto/upsert-own-company.dto";

@Controller("access-control")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get("reference")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.USERS)
  listReference(@CurrentUser() actor: AuthUser) {
    return this.accessControlService.listReference(actor);
  }

  @Post("companies")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ACCESS_MATRIX)
  createCompany(@Body() body: CreateCompanyDto, @CurrentUser() actor: AuthUser) {
    return this.accessControlService.createCompany(body, actor);
  }

  @Patch("companies/:companyId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ACCESS_MATRIX)
  updateCompany(
    @Param("companyId", ParseIntPipe) companyId: number,
    @Body() body: UpdateCompanyDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.accessControlService.updateCompany(companyId, body, actor);
  }

  @Get("company-profile")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  getOwnCompany(@CurrentUser() actor: AuthUser) {
    return this.accessControlService.getOwnCompany(actor);
  }

  @Put("company-profile")
  @Roles(Role.ADMIN)
  @RequiredModule(AppModuleCode.ERP_MANAGEMENT)
  upsertOwnCompany(@Body() body: UpsertOwnCompanyDto, @CurrentUser() actor: AuthUser) {
    return this.accessControlService.upsertOwnCompany(body, actor);
  }

  @Get("matrix/:companyId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ACCESS_MATRIX)
  getCompanyRoleMatrix(
    @Param("companyId", ParseIntPipe) companyId: number,
    @CurrentUser() actor: AuthUser
  ) {
    return this.accessControlService.getCompanyRoleMatrix(companyId, actor);
  }

  @Put("matrix/:companyId/roles/:roleId")
  @Roles(Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.ACCESS_MATRIX)
  updateCompanyRoleModules(
    @Param("companyId", ParseIntPipe) companyId: number,
    @Param("roleId", ParseIntPipe) roleId: number,
    @Body() body: UpdateCompanyRoleModulesDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.accessControlService.updateCompanyRoleModules(companyId, roleId, body, actor);
  }
}
