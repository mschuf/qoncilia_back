import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../access-control/entities/company.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { BankingController } from "./banking.controller";
import { BankingService } from "./banking.service";
import { User } from "../users/entities/user.entity";
import { BankEntity } from "./entities/bank.entity";
import { ConciliationSystem } from "./entities/conciliation-system.entity";
import { CompanyBankAccount } from "./entities/company-bank-account.entity";
import { ConciliationController } from "./conciliation.controller";
import { ConciliationService } from "./conciliation.service";
import { ReconciliationLayoutMapping } from "./entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "./entities/reconciliation-layout.entity";
import { ReconciliationMatch } from "./entities/reconciliation-match.entity";
import { Reconciliation } from "./entities/reconciliation.entity";
import { TemplateLayoutMapping } from "./entities/template-layout-mapping.entity";
import { TemplateLayout } from "./entities/template-layout.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Company,
      BankEntity,
      ConciliationSystem,
      CompanyBankAccount,
      TemplateLayout,
      TemplateLayoutMapping,
      ReconciliationLayout,
      ReconciliationLayoutMapping,
      Reconciliation,
      ReconciliationMatch
    ])
  ],
  controllers: [ConciliationController, BankingController],
  providers: [ConciliationService, BankingService, JwtAuthGuard, RolesGuard, ModuleAccessGuard],
  exports: [ConciliationService]
})
export class ConciliationModule {}
