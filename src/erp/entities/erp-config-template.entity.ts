import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"
import { ErpType } from "../../common/enums/erp-type.enum"
import { CompanyErpConfig } from "./company-erp-config.entity"

@Entity({ name: "erp_configuraciones_plantillas" })
export class ErpConfigTemplate {
  @PrimaryGeneratedColumn({ name: "ept_id" })
  id!: number

  erpType: ErpType = ErpType.SAP_B1

  @Column({ name: "ept_codigo", type: "varchar", length: 80 })
  code!: string

  @Column({ name: "ept_nombre", type: "varchar", length: 160 })
  name!: string

  @Column({ name: "ept_activo", type: "boolean", default: false })
  active!: boolean

  @Column({ name: "ept_es_predeterminado", type: "boolean", default: false })
  isDefault!: boolean

  @Column({ name: "ept_user_system", type: "varchar", length: 120, nullable: true })
  userSystem!: string | null

  @Column({ name: "ept_user_pass", type: "text", nullable: true })
  userPassEncrypted!: string | null

  @Column({ name: "ept_db_name", type: "varchar", length: 160, nullable: true })
  dbName!: string | null

  @Column({ name: "ept_server_node", type: "varchar", length: 160, nullable: true })
  serverNode!: string | null

  @Column({ name: "ept_db_user", type: "varchar", length: 160, nullable: true })
  dbUser!: string | null

  @Column({ name: "ept_db_password_enc", type: "text", nullable: true })
  dbPasswordEncrypted!: string | null

  @Column({ name: "ept_service_layer_url", type: "varchar", length: 255, nullable: true })
  serviceLayerUrl!: string | null

  @Column({ name: "ept_tls_version", type: "varchar", length: 10, nullable: true })
  tlsVersion!: string | null

  @Column({ name: "ept_allow_self_signed", type: "boolean", default: false })
  allowSelfSigned!: boolean

  @Column({ name: "ept_settings", type: "jsonb", nullable: true })
  settings!: Record<string, unknown> | null

  @OneToMany(() => CompanyErpConfig, (config) => config.template)
  configs!: CompanyErpConfig[]

  @CreateDateColumn({ name: "ept_created_at", type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ name: "ept_updated_at", type: "timestamptz" })
  updatedAt!: Date
}
