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
  @PrimaryGeneratedColumn({ name: "conciliacion_id" })
  id!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usuario_id", referencedColumnName: "id" })
  user!: User;

  @ManyToOne(() => BankEntity, (bank) => bank.reconciliations, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "banco_id", referencedColumnName: "id" })
  userBank!: BankEntity;

  @ManyToOne(() => ReconciliationLayout, (layout) => layout.reconciliations, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "plantilla_id", referencedColumnName: "id" })
  layout!: ReconciliationLayout;

  @ManyToOne(() => CompanyBankAccount, (account) => account.reconciliations, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "cuenta_bancaria_id", referencedColumnName: "id" })
  companyBankAccount!: CompanyBankAccount;

  @Column({ name: "conciliacion_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "conciliacion_estado", type: "varchar", length: 40, default: "saved" })
  status!: string;

  @Column({ name: "conciliacion_cantidad_actualizaciones", type: "integer", default: 0 })
  updateCount!: number;

  @Column({ name: "conciliacion_tiene_datos_sistema", type: "boolean", default: false })
  hasSystemData!: boolean;

  @Column({ name: "conciliacion_tiene_datos_banco", type: "boolean", default: false })
  hasBankData!: boolean;

  @Column({ name: "conciliacion_archivo_sistema", type: "varchar", length: 255, nullable: true })
  systemFileName!: string | null;

  @Column({ name: "conciliacion_archivo_banco", type: "varchar", length: 255, nullable: true })
  bankFileName!: string | null;

  @Column({ name: "conciliacion_total_filas_sistema", type: "integer", default: 0 })
  totalSystemRows!: number;

  @Column({ name: "conciliacion_total_filas_banco", type: "integer", default: 0 })
  totalBankRows!: number;

  @Column({ name: "conciliacion_matches_automaticos", type: "integer", default: 0 })
  autoMatches!: number;

  @Column({ name: "conciliacion_matches_manuales", type: "integer", default: 0 })
  manualMatches!: number;

  @Column({ name: "conciliacion_pendientes_sistema", type: "integer", default: 0 })
  unmatchedSystem!: number;

  @Column({ name: "conciliacion_pendientes_banco", type: "integer", default: 0 })
  unmatchedBank!: number;

  @Column({ name: "conciliacion_porcentaje_match", type: "double precision", default: 0 })
  matchPercentage!: number;

  @Column({ name: "conciliacion_resumen_snapshot", type: "jsonb", nullable: true })
  summarySnapshot!: Record<string, unknown> | null;

  @OneToMany(() => ReconciliationMatch, (match) => match.reconciliation)
  matches!: ReconciliationMatch[];

  @CreateDateColumn({ name: "conciliacion_creada_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "conciliacion_actualizada_en", type: "timestamptz" })
  updatedAt!: Date;
}
