import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { Company } from "../../access-control/entities/company.entity";
import { BankEntity } from "./bank.entity";

@Entity({ name: "empresas_cuentas_bancarias" })
export class CompanyBankAccount {
  @PrimaryGeneratedColumn({ name: "ecb_id" })
  id!: number;

  @ManyToOne(() => Company, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  company!: Company;

  @ManyToOne(() => BankEntity, (bank) => bank.accounts, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "ban_id", referencedColumnName: "id" })
  bank!: BankEntity;

  @Column({ name: "ecb_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "ecb_numero_cuenta", type: "varchar", length: 80 })
  accountNumber!: string;

  @Column({ name: "ecb_id_banco_erp", type: "varchar", length: 80 })
  bankErpId!: string;

  @Column({ name: "ecb_numero_cuenta_mayor", type: "varchar", length: 80 })
  majorAccountNumber!: string;

  @Column({ name: "ecb_numero_cuenta_pago", type: "varchar", length: 80, nullable: true })
  paymentAccountNumber!: string | null;

  @Column({ name: "ecb_activo", type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "ecb_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "ecb_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
