import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { CompanyBank } from "./company-bank.entity";

@Entity({ name: "empresas" })
export class Company {
  @PrimaryGeneratedColumn({ name: "emp_id" })
  id!: number;

  @Column({ name: "emp_nombre", type: "varchar", length: 160, unique: true })
  nombre!: string;

  @Column({ name: "emp_ruc", type: "varchar", length: 30, nullable: true, unique: true })
  ruc!: string | null;

  @Column({ name: "emp_email", type: "varchar", length: 160, nullable: true })
  email!: string | null;

  @Column({ name: "emp_telefono", type: "varchar", length: 40, nullable: true })
  telefono!: string | null;

  @Column({ name: "emp_direccion", type: "varchar", length: 255, nullable: true })
  direccion!: string | null;

  @Column({ name: "emp_activo", type: "boolean", default: true })
  activo!: boolean;

  @OneToMany(() => User, (user) => user.empresa)
  usuarios!: User[];

  @OneToMany(() => CompanyBank, (bank) => bank.empresa)
  bancos!: CompanyBank[];

  @CreateDateColumn({ name: "emp_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "emp_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
