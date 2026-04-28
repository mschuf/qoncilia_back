import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { ReconciliationLayout } from "./reconciliation-layout.entity";

@Entity({ name: "plantillas_conciliacion_mapeos" })
export class ReconciliationLayoutMapping {
  @PrimaryGeneratedColumn({ name: "mapeo_id" })
  id!: number;

  @ManyToOne(() => ReconciliationLayout, (layout) => layout.mappings, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "plantilla_id", referencedColumnName: "id" })
  layout!: ReconciliationLayout;

  @Column({ name: "mapeo_clave_campo", type: "varchar", length: 60 })
  fieldKey!: string;

  @Column({ name: "mapeo_etiqueta", type: "varchar", length: 120 })
  label!: string;

  @Column({ name: "mapeo_orden", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "mapeo_activo", type: "boolean", default: true })
  active!: boolean;

  @Column({ name: "mapeo_requerido", type: "boolean", default: false })
  required!: boolean;

  @Column({ name: "mapeo_operador_comparacion", type: "varchar", length: 40, default: "equals" })
  compareOperator!: string;

  @Column({ name: "mapeo_peso", type: "double precision", default: 1 })
  weight!: number;

  @Column({ name: "mapeo_tolerancia", type: "double precision", nullable: true })
  tolerance!: number | null;

  @Column({ name: "sistema_hoja", type: "varchar", length: 120, nullable: true })
  systemSheet!: string | null;

  @Column({ name: "sistema_columna", type: "varchar", length: 30, nullable: true })
  systemColumn!: string | null;

  @Column({ name: "sistema_fila_inicio", type: "integer", nullable: true })
  systemStartRow!: number | null;

  @Column({ name: "sistema_fila_fin", type: "integer", nullable: true })
  systemEndRow!: number | null;

  @Column({ name: "sistema_tipo_dato", type: "varchar", length: 20, default: "text" })
  systemDataType!: string;

  @Column({ name: "banco_hoja", type: "varchar", length: 120, nullable: true })
  bankSheet!: string | null;

  @Column({ name: "banco_columna", type: "varchar", length: 30, nullable: true })
  bankColumn!: string | null;

  @Column({ name: "banco_fila_inicio", type: "integer", nullable: true })
  bankStartRow!: number | null;

  @Column({ name: "banco_fila_fin", type: "integer", nullable: true })
  bankEndRow!: number | null;

  @Column({ name: "banco_tipo_dato", type: "varchar", length: 20, default: "text" })
  bankDataType!: string;

  @CreateDateColumn({ name: "mapeo_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "mapeo_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;
}
