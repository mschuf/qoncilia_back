import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Company } from "../access-control/entities/company.entity"
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard"
import { ModuleAccessGuard } from "../common/guards/module-access.guard"
import { RolesGuard } from "../common/guards/roles.guard"
import { BankStatement } from "../conciliation/entities/bank-statement.entity"
import { Reconciliation } from "../conciliation/entities/reconciliation.entity"
import { User } from "../users/entities/user.entity"
import { CompanyErpConfig } from "./entities/company-erp-config.entity"
import { ErpController } from "./erp.controller"
import { ErpService } from "./erp.service"
import { UserErpSession } from "./sap/entities/user-erp-session.entity"
import { SapB1Service } from "./sap/sap-b1.service"
import { SapErpController } from "./sap/sap-erp.controller"
import { SapErpService } from "./sap/sap-erp.service"

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Company,
      User,
      BankStatement,
      Reconciliation,
      CompanyErpConfig,
      UserErpSession
    ])
  ],
  controllers: [ErpController, SapErpController],
  providers: [ErpService, SapErpService, SapB1Service, JwtAuthGuard, RolesGuard, ModuleAccessGuard],
  exports: [ErpService]
})
export class ErpModule {}
