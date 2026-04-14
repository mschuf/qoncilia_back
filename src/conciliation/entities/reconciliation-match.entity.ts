import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Reconciliation } from "./reconciliation.entity";

@Entity({ name: "conciliacion_matches" })
export class ReconciliationMatch {
  @PrimaryGeneratedColumn({ name: "cmt_id" })
  id!: number;

  @ManyToOne(() => Reconciliation, (reconciliation) => reconciliation.matches, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "con_id", referencedColumnName: "id" })
  reconciliation!: Reconciliation;

  @Column({ name: "cmt_status", type: "varchar", length: 40 })
  status!: string;

  @Column({ name: "cmt_system_row_id", type: "varchar", length: 80, nullable: true })
  systemRowId!: string | null;

  @Column({ name: "cmt_bank_row_id", type: "varchar", length: 80, nullable: true })
  bankRowId!: string | null;

  @Column({ name: "cmt_system_row_number", type: "integer", nullable: true })
  systemRowNumber!: number | null;

  @Column({ name: "cmt_bank_row_number", type: "integer", nullable: true })
  bankRowNumber!: number | null;

  @Column({ name: "cmt_score", type: "double precision", nullable: true })
  score!: number | null;

  @Column({ name: "cmt_details", type: "jsonb", nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ name: "cmt_system_payload", type: "jsonb", nullable: true })
  systemPayload!: Record<string, unknown> | null;

  @Column({ name: "cmt_bank_payload", type: "jsonb", nullable: true })
  bankPayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "cmt_created_at", type: "timestamptz" })
  createdAt!: Date;
}
