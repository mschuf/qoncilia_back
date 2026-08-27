import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"
import { CompanyErpConfig } from "./company-erp-config.entity"

// Cuenta contable de comision por configuracion ERP de tarjetas. Mantenerla en
// una entidad separada evita mezclar reglas de deposito con cuentas bancarias.
@Entity({ name: "empresas_erp_tarjetas_comisiones" })
export class CompanyCardCreditCommissionConfig {
  @PrimaryGeneratedColumn({ name: "etc_id" })
  id!: number

  @OneToOne(() => CompanyErpConfig, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "epc_id", referencedColumnName: "id" })
  companyErpConfig!: CompanyErpConfig

  @Column({ name: "etc_cuenta_comision_credito", type: "varchar", length: 80 })
  creditCommissionAccount!: string

  @Column({ name: "etc_activa", type: "boolean", default: true })
  active!: boolean

  @CreateDateColumn({ name: "etc_created_at", type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ name: "etc_updated_at", type: "timestamptz" })
  updatedAt!: Date
}
