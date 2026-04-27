import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { BankEntity } from "./bank.entity";
import { CompanyBankAccount } from "./company-bank-account.entity";
import { ReconciliationLayout } from "./reconciliation-layout.entity";
import { ReconciliationMatch } from "./reconciliation-match.entity";

@Entity({ name: "conciliaciones" })
export class Reconciliation {
  @PrimaryGeneratedColumn({ name: "con_id" })
  id!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usr_id", referencedColumnName: "id" })
  user!: User;

  @ManyToOne(() => BankEntity, (bank) => bank.reconciliations, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "ban_id", referencedColumnName: "id" })
  userBank!: BankEntity;

  @ManyToOne(() => ReconciliationLayout, (layout) => layout.reconciliations, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "lyt_id", referencedColumnName: "id" })
  layout!: ReconciliationLayout;

  @ManyToOne(() => CompanyBankAccount, (account) => account.reconciliations, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "ecb_id", referencedColumnName: "id" })
  companyBankAccount!: CompanyBankAccount | null;

  @Column({ name: "con_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "con_estado", type: "varchar", length: 40, default: "saved" })
  status!: string;

  @Column({ name: "con_update_count", type: "integer", default: 0 })
  updateCount!: number;

  @Column({ name: "con_has_system_data", type: "boolean", default: false })
  hasSystemData!: boolean;

  @Column({ name: "con_has_bank_data", type: "boolean", default: false })
  hasBankData!: boolean;

  @Column({ name: "con_system_filename", type: "varchar", length: 255, nullable: true })
  systemFileName!: string | null;

  @Column({ name: "con_bank_filename", type: "varchar", length: 255, nullable: true })
  bankFileName!: string | null;

  @Column({ name: "con_total_system_rows", type: "integer", default: 0 })
  totalSystemRows!: number;

  @Column({ name: "con_total_bank_rows", type: "integer", default: 0 })
  totalBankRows!: number;

  @Column({ name: "con_auto_matches", type: "integer", default: 0 })
  autoMatches!: number;

  @Column({ name: "con_manual_matches", type: "integer", default: 0 })
  manualMatches!: number;

  @Column({ name: "con_unmatched_system", type: "integer", default: 0 })
  unmatchedSystem!: number;

  @Column({ name: "con_unmatched_bank", type: "integer", default: 0 })
  unmatchedBank!: number;

  @Column({ name: "con_match_percentage", type: "double precision", default: 0 })
  matchPercentage!: number;

  @Column({ name: "con_summary_snapshot", type: "jsonb", nullable: true })
  summarySnapshot!: Record<string, unknown> | null;

  @OneToMany(() => ReconciliationMatch, (match) => match.reconciliation)
  matches!: ReconciliationMatch[];

  @CreateDateColumn({ name: "con_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "con_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
