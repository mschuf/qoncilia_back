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
import { BankStatement } from "./bank-statement.entity";
import { ReconciliationLayout } from "./reconciliation-layout.entity";
import { Reconciliation } from "./reconciliation.entity";

@Entity({ name: "bancos" })
export class BankEntity {
  @PrimaryGeneratedColumn({ name: "banco_id" })
  id!: number;

  @ManyToOne(() => Company, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "empresa_id", referencedColumnName: "id" })
  company!: Company;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usuario_id", referencedColumnName: "id" })
  user!: User;

  @ManyToOne(() => BankEntity, (bank) => bank.assignedBanks, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "banco_origen_id", referencedColumnName: "id" })
  sourceBank!: BankEntity | null;

  @Column({ name: "banco_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "banco_alias", type: "varchar", length: 120, nullable: true })
  alias!: string | null;

  @Column({ name: "banco_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "banco_sucursal", type: "varchar", length: 120, nullable: true })
  branch!: string | null;

  @Column({ name: "banco_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => CompanyBankAccount, (account) => account.bank)
  accounts!: CompanyBankAccount[];

  @OneToMany(() => BankEntity, (bank) => bank.sourceBank)
  assignedBanks!: BankEntity[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.userBank)
  layouts!: ReconciliationLayout[];

  @OneToMany(() => BankStatement, (statement) => statement.userBank)
  statements!: BankStatement[];

  @OneToMany(() => Reconciliation, (reconciliation) => reconciliation.userBank)
  reconciliations!: Reconciliation[];

  @CreateDateColumn({ name: "banco_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "banco_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;

  get bankName(): string {
    return this.name;
  }

  set bankName(value: string) {
    this.name = value;
  }
}
