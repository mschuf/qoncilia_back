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
import { Reconciliation } from "../../conciliation/entities/reconciliation.entity"
import { CompanyErpConfig } from "./company-erp-config.entity"

@Entity({ name: "conciliaciones_erp_envios" })
export class ReconciliationErpShipment {
  @PrimaryGeneratedColumn({ name: "ces_id" })
  id!: number

  @ManyToOne(() => Reconciliation, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "con_id", referencedColumnName: "id" })
  reconciliation!: Reconciliation

  @ManyToOne(() => CompanyErpConfig, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "epc_id", referencedColumnName: "id" })
  companyErpConfig!: CompanyErpConfig

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "usr_sender_id", referencedColumnName: "id" })
  sender!: User

  @Column({ name: "ces_documento_tipo", type: "varchar", length: 40 })
  documentType!: string

  @Column({ name: "ces_estado", type: "varchar", length: 40, default: "pending" })
  status!: string

  @Column({ name: "ces_endpoint", type: "varchar", length: 255, nullable: true })
  endpoint!: string | null

  @Column({ name: "ces_http_status", type: "integer", nullable: true })
  httpStatus!: number | null

  @Column({ name: "ces_request_payload", type: "jsonb", nullable: true })
  requestPayload!: Record<string, unknown> | null

  @Column({ name: "ces_response_payload", type: "jsonb", nullable: true })
  responsePayload!: Record<string, unknown> | null

  @Column({ name: "ces_error_message", type: "varchar", length: 500, nullable: true })
  errorMessage!: string | null

  @Column({ name: "ces_external_doc_entry", type: "varchar", length: 80, nullable: true })
  externalDocEntry!: string | null

  @Column({ name: "ces_external_doc_num", type: "varchar", length: 80, nullable: true })
  externalDocNum!: string | null

  @CreateDateColumn({ name: "ces_created_at", type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ name: "ces_updated_at", type: "timestamptz" })
  updatedAt!: Date
}
