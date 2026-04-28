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

@Entity({ name: "plantillas_base" })
export class TemplateLayout {
  @PrimaryGeneratedColumn({ name: "plantilla_base_id" })
  id!: number;

  @Column({ name: "plantilla_base_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "plantilla_base_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "plantilla_base_banco_referencia", type: "varchar", length: 120, nullable: true })
  referenceBankName!: string | null;

  @ManyToOne(() => ConciliationSystem, (system) => system.templateLayouts, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "sistema_id", referencedColumnName: "id" })
  system!: ConciliationSystem;

  @Column({ name: "plantilla_base_etiqueta_sistema", type: "varchar", length: 120, default: "Sistema" })
  systemLabel!: string;

  @Column({ name: "plantilla_base_etiqueta_banco", type: "varchar", length: 120, default: "Banco" })
  bankLabel!: string;

  @Column({ name: "plantilla_base_umbral_auto_match", type: "double precision", default: 1 })
  autoMatchThreshold!: number;

  @Column({ name: "plantilla_base_activa", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => TemplateLayoutMapping, (mapping) => mapping.templateLayout)
  mappings!: TemplateLayoutMapping[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.templateLayout)
  layouts!: ReconciliationLayout[];

  @CreateDateColumn({ name: "plantilla_base_creada_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "plantilla_base_actualizada_en", type: "timestamptz" })
  updatedAt!: Date;
}
