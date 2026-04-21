import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { User } from "../users/entities/user.entity";
import { ConciliationController } from "./conciliation.controller";
import { ConciliationService } from "./conciliation.service";
import { ReconciliationLayoutMapping } from "./entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "./entities/reconciliation-layout.entity";
import { ReconciliationMatch } from "./entities/reconciliation-match.entity";
import { Reconciliation } from "./entities/reconciliation.entity";
import { TemplateLayoutMapping } from "./entities/template-layout-mapping.entity";
import { TemplateLayout } from "./entities/template-layout.entity";
import { UserBank } from "./entities/user-bank.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserBank,
      TemplateLayout,
      TemplateLayoutMapping,
      ReconciliationLayout,
      ReconciliationLayoutMapping,
      Reconciliation,
      ReconciliationMatch
    ])
  ],
  controllers: [ConciliationController],
  providers: [ConciliationService, JwtAuthGuard, RolesGuard, ModuleAccessGuard],
  exports: [ConciliationService]
})
export class ConciliationModule {}
