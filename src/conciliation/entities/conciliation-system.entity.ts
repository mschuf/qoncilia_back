import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { ReconciliationLayout } from "./reconciliation-layout.entity";
import { TemplateLayout } from "./template-layout.entity";

@Entity({ name: "sistemas" })
export class ConciliationSystem {
  @PrimaryGeneratedColumn({ name: "sistema_id" })
  id!: number;

  @Column({ name: "sistema_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "sistema_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "sistema_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => TemplateLayout, (templateLayout) => templateLayout.system)
  templateLayouts!: TemplateLayout[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.system)
  layouts!: ReconciliationLayout[];

  @CreateDateColumn({ name: "sistema_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "sistema_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;
}
