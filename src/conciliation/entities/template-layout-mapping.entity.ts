import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { TemplateLayout } from "./template-layout.entity";

@Entity({ name: "plantillas_base_mapeos" })
export class TemplateLayoutMapping {
  @PrimaryGeneratedColumn({ name: "mapeo_base_id" })
  id!: number;

  @ManyToOne(() => TemplateLayout, (templateLayout) => templateLayout.mappings, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "plantilla_base_id", referencedColumnName: "id" })
  templateLayout!: TemplateLayout;

  @Column({ name: "mapeo_base_clave_campo", type: "varchar", length: 60 })
  fieldKey!: string;

  @Column({ name: "mapeo_base_etiqueta", type: "varchar", length: 120 })
  label!: string;

  @Column({ name: "mapeo_base_orden", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "mapeo_base_activo", type: "boolean", default: true })
  active!: boolean;

  @Column({ name: "mapeo_base_requerido", type: "boolean", default: false })
  required!: boolean;

  @Column({ name: "mapeo_base_operador_comparacion", type: "varchar", length: 40, default: "equals" })
  compareOperator!: string;

  @Column({ name: "mapeo_base_peso", type: "double precision", default: 1 })
  weight!: number;

  @Column({ name: "mapeo_base_tolerancia", type: "double precision", nullable: true })
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

  @CreateDateColumn({ name: "mapeo_base_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "mapeo_base_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;
}
