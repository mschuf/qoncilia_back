import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppModuleEntity } from "../access-control/entities/app-module.entity";
import { CompanyRoleModule } from "../access-control/entities/company-role-module.entity";
import { Company } from "../access-control/entities/company.entity";
import { UserRole } from "../access-control/entities/user-role.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { User } from "./entities/user.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, Company, UserRole, AppModuleEntity, CompanyRoleModule])],
  controllers: [UsersController],
  providers: [UsersService, JwtAuthGuard, RolesGuard, ModuleAccessGuard],
  exports: [UsersService]
})
export class UsersModule {}
