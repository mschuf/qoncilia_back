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
import { User } from "../../users/entities/user.entity";
import { CompanyBankAccount } from "./company-bank-account.entity";
import { ReconciliationLayout } from "./reconciliation-layout.entity";
import { Reconciliation } from "./reconciliation.entity";

@Entity({ name: "bancos" })
export class BankEntity {
  @PrimaryGeneratedColumn({ name: "ban_id" })
  id!: number;

  @ManyToOne(() => Company, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  company!: Company;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usr_id", referencedColumnName: "id" })
  user!: User;

  @ManyToOne(() => BankEntity, (bank) => bank.assignedBanks, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "ban_source_bank_id", referencedColumnName: "id" })
  sourceBank!: BankEntity | null;

  @Column({ name: "ban_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "ban_alias", type: "varchar", length: 120, nullable: true })
  alias!: string | null;

  @Column({ name: "ban_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "ban_sucursal", type: "varchar", length: 120, nullable: true })
  branch!: string | null;

  @Column({ name: "ban_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => CompanyBankAccount, (account) => account.bank)
  accounts!: CompanyBankAccount[];

  @OneToMany(() => BankEntity, (bank) => bank.sourceBank)
  assignedBanks!: BankEntity[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.userBank)
  layouts!: ReconciliationLayout[];

  @OneToMany(() => Reconciliation, (reconciliation) => reconciliation.userBank)
  reconciliations!: Reconciliation[];

  @CreateDateColumn({ name: "ban_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "ban_updated_at", type: "timestamptz" })
  updatedAt!: Date;

  get bankName(): string {
    return this.name;
  }

  set bankName(value: string) {
    this.name = value;
  }
}
