import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { CompanyBankAccount } from "./company-bank-account.entity";

@Entity({ name: "bancos" })
export class BankEntity {
  @PrimaryGeneratedColumn({ name: "ban_id" })
  id!: number;

  @Column({ name: "ban_nombre", type: "varchar", length: 160, unique: true })
  name!: string;

  @Column({ name: "ban_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => CompanyBankAccount, (account) => account.bank)
  accounts!: CompanyBankAccount[];

  @CreateDateColumn({ name: "ban_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "ban_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
