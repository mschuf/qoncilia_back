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
import { BankStatement } from "./entities/bank-statement.entity";
import { BankStatementRow } from "./entities/bank-statement-row.entity";
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
import { BankTemplateAvailability } from "./entities/bank-template-availability.entity";
import { Currency } from "./entities/currency.entity";
import { UserTemplateAvailability } from "./entities/user-template-availability.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Company,
      BankEntity,
      BankStatement,
      BankStatementRow,
      Currency,
      ConciliationSystem,
      CompanyBankAccount,
      TemplateLayout,
      TemplateLayoutMapping,
      BankTemplateAvailability,
      UserTemplateAvailability,
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
