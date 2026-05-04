import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"
import { User } from "../../users/entities/user.entity"
import { ErpType } from "../../common/enums/erp-type.enum"
import { CompanyErpConfig } from "./company-erp-config.entity"

@Entity({ name: "usuarios_erp_sesiones" })
export class UserErpSession {
  @PrimaryGeneratedColumn({ name: "ues_id" })
  id!: number

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usuario_id", referencedColumnName: "id" })
  user!: User

  @ManyToOne(() => CompanyErpConfig, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "epc_id", referencedColumnName: "id" })
  companyErpConfig!: CompanyErpConfig

  @Column({ name: "ues_erp_tipo", type: "varchar", length: 50, default: ErpType.SAP_B1 })
  erpType!: ErpType

  @Column({ name: "ues_username", type: "varchar", length: 160 })
  username!: string

  @Column({ name: "ues_session_cookie_enc", type: "text" })
  sessionCookieEncrypted!: string

  @Column({ name: "ues_expires_at", type: "timestamptz", nullable: true })
  expiresAt!: Date | null

  @Column({ name: "ues_last_validated_at", type: "timestamptz", nullable: true })
  lastValidatedAt!: Date | null

  @Column({ name: "ues_invalidated_at", type: "timestamptz", nullable: true })
  invalidatedAt!: Date | null

  @CreateDateColumn({ name: "ues_created_at", type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ name: "ues_updated_at", type: "timestamptz" })
  updatedAt!: Date
}
