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

@Entity({ name: "conciliacion_layout_mappings" })
export class ReconciliationLayoutMapping {
  @PrimaryGeneratedColumn({ name: "lmp_id" })
  id!: number;

  @ManyToOne(() => ReconciliationLayout, (layout) => layout.mappings, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "lyt_id", referencedColumnName: "id" })
  layout!: ReconciliationLayout;

  @Column({ name: "lmp_field_key", type: "varchar", length: 60 })
  fieldKey!: string;

  @Column({ name: "lmp_label", type: "varchar", length: 120 })
  label!: string;

  @Column({ name: "lmp_sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "lmp_active", type: "boolean", default: true })
  active!: boolean;

  @Column({ name: "lmp_required", type: "boolean", default: false })
  required!: boolean;

  @Column({ name: "lmp_compare_operator", type: "varchar", length: 40, default: "equals" })
  compareOperator!: string;

  @Column({ name: "lmp_weight", type: "double precision", default: 1 })
  weight!: number;

  @Column({ name: "lmp_tolerance", type: "double precision", nullable: true })
  tolerance!: number | null;

  @Column({ name: "lmp_system_sheet", type: "varchar", length: 120, nullable: true })
  systemSheet!: string | null;

  @Column({ name: "lmp_system_column", type: "varchar", length: 10, nullable: true })
  systemColumn!: string | null;

  @Column({ name: "lmp_system_start_row", type: "integer", nullable: true })
  systemStartRow!: number | null;

  @Column({ name: "lmp_system_end_row", type: "integer", nullable: true })
  systemEndRow!: number | null;

  @Column({ name: "lmp_system_data_type", type: "varchar", length: 20, default: "text" })
  systemDataType!: string;

  @Column({ name: "lmp_bank_sheet", type: "varchar", length: 120, nullable: true })
  bankSheet!: string | null;

  @Column({ name: "lmp_bank_column", type: "varchar", length: 10, nullable: true })
  bankColumn!: string | null;

  @Column({ name: "lmp_bank_start_row", type: "integer", nullable: true })
  bankStartRow!: number | null;

  @Column({ name: "lmp_bank_end_row", type: "integer", nullable: true })
  bankEndRow!: number | null;

  @Column({ name: "lmp_bank_data_type", type: "varchar", length: 20, default: "text" })
  bankDataType!: string;

  @CreateDateColumn({ name: "lmp_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "lmp_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
