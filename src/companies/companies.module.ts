import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CompanyBank } from "./entities/company-bank.entity";
import { Company } from "./entities/company.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Company, CompanyBank])],
  controllers: [CompaniesController],
  providers: [CompaniesService, JwtAuthGuard, RolesGuard],
  exports: [CompaniesService]
})
export class CompaniesModule {}
