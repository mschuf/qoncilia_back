import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Company } from "../access-control/entities/company.entity"
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard"
import { ModuleAccessGuard } from "../common/guards/module-access.guard"
import { RolesGuard } from "../common/guards/roles.guard"
import { Reconciliation } from "../conciliation/entities/reconciliation.entity"
import { User } from "../users/entities/user.entity"
import { CompanyErpConfig } from "./entities/company-erp-config.entity"
import { UserErpSession } from "./entities/user-erp-session.entity"
import { ErpController } from "./erp.controller"
import { ErpService } from "./erp.service"
import { SapB1Service } from "./sap/sap-b1.service"
import { SapErpController } from "./sap/sap-erp.controller"

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Company,
      User,
      Reconciliation,
      CompanyErpConfig,
      UserErpSession
    ])
  ],
  controllers: [ErpController, SapErpController],
  providers: [ErpService, SapB1Service, JwtAuthGuard, RolesGuard, ModuleAccessGuard],
  exports: [ErpService]
})
export class ErpModule {}
