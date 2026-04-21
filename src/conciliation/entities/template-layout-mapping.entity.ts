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

@Entity({ name: "template_layout_mapping" })
export class TemplateLayoutMapping {
  @PrimaryGeneratedColumn({ name: "tpm_id" })
  id!: number;

  @ManyToOne(() => TemplateLayout, (templateLayout) => templateLayout.mappings, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "tpl_id", referencedColumnName: "id" })
  templateLayout!: TemplateLayout;

  @Column({ name: "tpm_field_key", type: "varchar", length: 60 })
  fieldKey!: string;

  @Column({ name: "tpm_label", type: "varchar", length: 120 })
  label!: string;

  @Column({ name: "tpm_sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "tpm_active", type: "boolean", default: true })
  active!: boolean;

  @Column({ name: "tpm_required", type: "boolean", default: false })
  required!: boolean;

  @Column({ name: "tpm_compare_operator", type: "varchar", length: 40, default: "equals" })
  compareOperator!: string;

  @Column({ name: "tpm_weight", type: "double precision", default: 1 })
  weight!: number;

  @Column({ name: "tpm_tolerance", type: "double precision", nullable: true })
  tolerance!: number | null;

  @Column({ name: "tpm_system_sheet", type: "varchar", length: 120, nullable: true })
  systemSheet!: string | null;

  @Column({ name: "tpm_system_column", type: "varchar", length: 30, nullable: true })
  systemColumn!: string | null;

  @Column({ name: "tpm_system_start_row", type: "integer", nullable: true })
  systemStartRow!: number | null;

  @Column({ name: "tpm_system_end_row", type: "integer", nullable: true })
  systemEndRow!: number | null;

  @Column({ name: "tpm_system_data_type", type: "varchar", length: 20, default: "text" })
  systemDataType!: string;

  @Column({ name: "tpm_bank_sheet", type: "varchar", length: 120, nullable: true })
  bankSheet!: string | null;

  @Column({ name: "tpm_bank_column", type: "varchar", length: 30, nullable: true })
  bankColumn!: string | null;

  @Column({ name: "tpm_bank_start_row", type: "integer", nullable: true })
  bankStartRow!: number | null;

  @Column({ name: "tpm_bank_end_row", type: "integer", nullable: true })
  bankEndRow!: number | null;

  @Column({ name: "tpm_bank_data_type", type: "varchar", length: 20, default: "text" })
  bankDataType!: string;

  @CreateDateColumn({ name: "tpm_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "tpm_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
