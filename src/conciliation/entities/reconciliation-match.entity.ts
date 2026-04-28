import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Reconciliation } from "./reconciliation.entity";

@Entity({ name: "conciliacion_resultados" })
export class ReconciliationMatch {
  @PrimaryGeneratedColumn({ name: "resultado_id" })
  id!: number;

  @ManyToOne(() => Reconciliation, (reconciliation) => reconciliation.matches, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "conciliacion_id", referencedColumnName: "id" })
  reconciliation!: Reconciliation;

  @Column({ name: "resultado_estado", type: "varchar", length: 40 })
  status!: string;

  @Column({ name: "sistema_fila_id", type: "varchar", length: 80, nullable: true })
  systemRowId!: string | null;

  @Column({ name: "banco_fila_id", type: "varchar", length: 80, nullable: true })
  bankRowId!: string | null;

  @Column({ name: "sistema_numero_fila", type: "integer", nullable: true })
  systemRowNumber!: number | null;

  @Column({ name: "banco_numero_fila", type: "integer", nullable: true })
  bankRowNumber!: number | null;

  @Column({ name: "resultado_score", type: "double precision", nullable: true })
  score!: number | null;

  @Column({ name: "resultado_detalle", type: "jsonb", nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ name: "sistema_payload", type: "jsonb", nullable: true })
  systemPayload!: Record<string, unknown> | null;

  @Column({ name: "banco_payload", type: "jsonb", nullable: true })
  bankPayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "resultado_creado_en", type: "timestamptz" })
  createdAt!: Date;
}
