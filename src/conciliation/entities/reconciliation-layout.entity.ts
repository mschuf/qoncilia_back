import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { Reconciliation } from "./reconciliation.entity";
import { ConciliationSystem } from "./conciliation-system.entity";
import { ReconciliationLayoutMapping } from "./reconciliation-layout-mapping.entity";
import { TemplateLayout } from "./template-layout.entity";
import { BankEntity } from "./bank.entity";

@Entity({ name: "conciliacion_layouts" })
export class ReconciliationLayout {
  @PrimaryGeneratedColumn({ name: "lyt_id" })
  id!: number;

  @ManyToOne(() => BankEntity, (bank) => bank.layouts, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ban_id", referencedColumnName: "id" })
  userBank!: BankEntity;

  @ManyToOne(() => TemplateLayout, (templateLayout) => templateLayout.layouts, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "tpl_id", referencedColumnName: "id" })
  templateLayout!: TemplateLayout | null;

  @ManyToOne(() => ConciliationSystem, (system) => system.layouts, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "sys_id", referencedColumnName: "id" })
  system!: ConciliationSystem;

  @ManyToOne(() => ReconciliationLayout, (layout) => layout.assignedLayouts, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "lyt_source_layout_id", referencedColumnName: "id" })
  sourceLayout!: ReconciliationLayout | null;

  @Column({ name: "lyt_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "lyt_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "lyt_system_label", type: "varchar", length: 120, default: "Sistema" })
  systemLabel!: string;

  @Column({ name: "lyt_bank_label", type: "varchar", length: 120, default: "Banco" })
  bankLabel!: string;

  @Column({ name: "lyt_auto_match_threshold", type: "double precision", default: 1 })
  autoMatchThreshold!: number;

  @Column({ name: "lyt_activo", type: "boolean", default: false })
  active!: boolean;

  @OneToMany(() => ReconciliationLayoutMapping, (mapping) => mapping.layout)
  mappings!: ReconciliationLayoutMapping[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.sourceLayout)
  assignedLayouts!: ReconciliationLayout[];

  @OneToMany(() => Reconciliation, (reconciliation) => reconciliation.layout)
  reconciliations!: Reconciliation[];

  @CreateDateColumn({ name: "lyt_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "lyt_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
