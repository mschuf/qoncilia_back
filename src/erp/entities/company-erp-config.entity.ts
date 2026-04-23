import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"
import { Company } from "../../access-control/entities/company.entity"
import { ErpType } from "../../common/enums/erp-type.enum"

@Entity({ name: "empresas_erp_configuraciones" })
export class CompanyErpConfig {
  @PrimaryGeneratedColumn({ name: "epc_id" })
  id!: number

  @ManyToOne(() => Company, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  company!: Company

  @Column({ name: "epc_codigo", type: "varchar", length: 80 })
  code!: string

  @Column({ name: "epc_nombre", type: "varchar", length: 160 })
  name!: string

  @Column({ name: "epc_tipo", type: "varchar", length: 50, default: ErpType.SAP_B1 })
  erpType!: ErpType

  @Column({ name: "epc_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null

  @Column({ name: "epc_activo", type: "boolean", default: true })
  active!: boolean

  @Column({ name: "epc_es_predeterminado", type: "boolean", default: false })
  isDefault!: boolean

  @Column({ name: "epc_sap_username", type: "varchar", length: 120, nullable: true })
  sapUsername!: string | null

  @Column({ name: "epc_db_name", type: "varchar", length: 160, nullable: true })
  dbName!: string | null

  @Column({ name: "epc_cmp_name", type: "varchar", length: 160, nullable: true })
  cmpName!: string | null

  @Column({ name: "epc_server_node", type: "varchar", length: 160, nullable: true })
  serverNode!: string | null

  @Column({ name: "epc_db_user", type: "varchar", length: 160, nullable: true })
  dbUser!: string | null

  @Column({ name: "epc_db_password_enc", type: "text", nullable: true })
  dbPasswordEncrypted!: string | null

  @Column({ name: "epc_service_layer_url", type: "varchar", length: 255, nullable: true })
  serviceLayerUrl!: string | null

  @Column({ name: "epc_tls_version", type: "varchar", length: 10, nullable: true })
  tlsVersion!: string | null

  @Column({ name: "epc_allow_self_signed", type: "boolean", default: false })
  allowSelfSigned!: boolean

  @Column({ name: "epc_settings", type: "jsonb", nullable: true })
  settings!: Record<string, unknown> | null

  @CreateDateColumn({ name: "epc_created_at", type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ name: "epc_updated_at", type: "timestamptz" })
  updatedAt!: Date
}
