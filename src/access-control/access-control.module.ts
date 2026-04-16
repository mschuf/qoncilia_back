import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AccessControlController } from "./access-control.controller";
import { AccessControlService } from "./access-control.service";
import { AppModuleEntity } from "./entities/app-module.entity";
import { CompanyRoleModule } from "./entities/company-role-module.entity";
import { Company } from "./entities/company.entity";
import { UserRole } from "./entities/user-role.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Company, UserRole, AppModuleEntity, CompanyRoleModule])],
  controllers: [AccessControlController],
  providers: [AccessControlService, JwtAuthGuard, RolesGuard, ModuleAccessGuard],
  exports: [AccessControlService, TypeOrmModule]
})
export class AccessControlModule {}
