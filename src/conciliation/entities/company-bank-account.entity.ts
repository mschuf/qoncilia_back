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
import { Company } from "../../access-control/entities/company.entity";
import { BankEntity } from "./bank.entity";
import { Reconciliation } from "./reconciliation.entity";

@Entity({ name: "cuentas_bancarias" })
export class CompanyBankAccount {
  @PrimaryGeneratedColumn({ name: "cuenta_bancaria_id" })
  id!: number;

  @ManyToOne(() => Company, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "empresa_id", referencedColumnName: "id" })
  company!: Company;

  @ManyToOne(() => BankEntity, (bank) => bank.accounts, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "banco_id", referencedColumnName: "id" })
  bank!: BankEntity;

  @ManyToOne(() => CompanyBankAccount, (account) => account.assignedAccounts, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "cuenta_bancaria_origen_id", referencedColumnName: "id" })
  sourceAccount!: CompanyBankAccount | null;

  @Column({ name: "cuenta_bancaria_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "moneda_codigo", type: "varchar", length: 10, default: "PYG" })
  currency!: string;

  @Column({ name: "cuenta_bancaria_numero", type: "varchar", length: 80 })
  accountNumber!: string;

  @Column({ name: "cuenta_bancaria_id_banco_erp", type: "varchar", length: 80 })
  bankErpId!: string;

  @Column({ name: "cuenta_bancaria_numero_mayor", type: "varchar", length: 80 })
  majorAccountNumber!: string;

  @Column({ name: "cuenta_bancaria_numero_pago", type: "varchar", length: 80, nullable: true })
  paymentAccountNumber!: string | null;

  @Column({ name: "cuenta_bancaria_activa", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => CompanyBankAccount, (account) => account.sourceAccount)
  assignedAccounts!: CompanyBankAccount[];

  @OneToMany(() => Reconciliation, (reconciliation) => reconciliation.companyBankAccount)
  reconciliations!: Reconciliation[];

  @CreateDateColumn({ name: "cuenta_bancaria_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "cuenta_bancaria_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;
}
