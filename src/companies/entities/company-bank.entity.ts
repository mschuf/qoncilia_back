import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { Company } from "./company.entity";

@Entity({ name: "empresas_bancos" })
export class CompanyBank {
  @PrimaryGeneratedColumn({ name: "eba_id" })
  id!: number;

  @ManyToOne(() => Company, (company) => company.bancos, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  empresa!: Company;

  @Column({ name: "eba_banco_nombre", type: "varchar", length: 120 })
  bancoNombre!: string;

  @Column({ name: "eba_tipo_cuenta", type: "varchar", length: 40 })
  tipoCuenta!: string;

  @Column({ name: "eba_moneda", type: "varchar", length: 10 })
  moneda!: string;

  @Column({ name: "eba_numero_cuenta", type: "varchar", length: 80 })
  numeroCuenta!: string;

  @Column({ name: "eba_titular", type: "varchar", length: 160, nullable: true })
  titular!: string | null;

  @Column({ name: "eba_sucursal", type: "varchar", length: 120, nullable: true })
  sucursal!: string | null;

  @Column({ name: "eba_activo", type: "boolean", default: true })
  activo!: boolean;

  @CreateDateColumn({ name: "eba_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "eba_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
