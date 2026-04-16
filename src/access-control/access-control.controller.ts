import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyRoleModulesDto } from "./dto/update-company-role-modules.dto";
import { AccessControlService } from "./access-control.service";

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
