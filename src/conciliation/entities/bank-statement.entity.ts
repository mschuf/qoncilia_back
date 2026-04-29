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
import { BankStatementRow } from "./bank-statement-row.entity";
import { CompanyBankAccount } from "./company-bank-account.entity";
import { ReconciliationLayout } from "./reconciliation-layout.entity";

@Entity({ name: "extractos_bancarios" })
export class BankStatement {
  @PrimaryGeneratedColumn({ name: "extracto_id" })
  id!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usuario_id", referencedColumnName: "id" })
  user!: User;

  @ManyToOne(() => BankEntity, (bank) => bank.statements, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "banco_id", referencedColumnName: "id" })
  userBank!: BankEntity;

  @ManyToOne(() => CompanyBankAccount, (account) => account.statements, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "cuenta_bancaria_id", referencedColumnName: "id" })
  companyBankAccount!: CompanyBankAccount;

  @ManyToOne(() => ReconciliationLayout, (layout) => layout.statements, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "plantilla_id", referencedColumnName: "id" })
  layout!: ReconciliationLayout;

  @Column({ name: "extracto_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "extracto_archivo", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "extracto_estado", type: "varchar", length: 40, default: "saved" })
  status!: string;

  @Column({ name: "extracto_total_filas", type: "integer", default: 0 })
  rowCount!: number;

  @Column({ name: "extracto_metadata", type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @OneToMany(() => BankStatementRow, (row) => row.statement)
  rows!: BankStatementRow[];

  @CreateDateColumn({ name: "extracto_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "extracto_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;
}
