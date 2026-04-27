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
import { ConciliationSystem } from "./conciliation-system.entity";
import { ReconciliationLayout } from "./reconciliation-layout.entity";
import { TemplateLayoutMapping } from "./template-layout-mapping.entity";

@Entity({ name: "template_layout" })
export class TemplateLayout {
  @PrimaryGeneratedColumn({ name: "tpl_id" })
  id!: number;

  @Column({ name: "tpl_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "tpl_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "tpl_banco_referencia", type: "varchar", length: 120, nullable: true })
  referenceBankName!: string | null;

  @ManyToOne(() => ConciliationSystem, (system) => system.templateLayouts, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "sys_id", referencedColumnName: "id" })
  system!: ConciliationSystem;

  @Column({ name: "tpl_system_label", type: "varchar", length: 120, default: "Sistema" })
  systemLabel!: string;

  @Column({ name: "tpl_bank_label", type: "varchar", length: 120, default: "Banco" })
  bankLabel!: string;

  @Column({ name: "tpl_auto_match_threshold", type: "double precision", default: 1 })
  autoMatchThreshold!: number;

  @Column({ name: "tpl_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => TemplateLayoutMapping, (mapping) => mapping.templateLayout)
  mappings!: TemplateLayoutMapping[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.templateLayout)
  layouts!: ReconciliationLayout[];

  @CreateDateColumn({ name: "tpl_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "tpl_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
