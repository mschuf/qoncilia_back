import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { User } from "../users/entities/user.entity";
import { ConciliationController } from "./conciliation.controller";
import { ConciliationService } from "./conciliation.service";
import { ReconciliationLayoutMapping } from "./entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "./entities/reconciliation-layout.entity";
import { ReconciliationMatch } from "./entities/reconciliation-match.entity";
import { Reconciliation } from "./entities/reconciliation.entity";
import { UserBank } from "./entities/user-bank.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserBank,
      ReconciliationLayout,
      ReconciliationLayoutMapping,
      Reconciliation,
      ReconciliationMatch
    ])
  ],
  controllers: [ConciliationController],
  providers: [ConciliationService, JwtAuthGuard, RolesGuard],
  exports: [ConciliationService]
})
export class ConciliationModule {}
