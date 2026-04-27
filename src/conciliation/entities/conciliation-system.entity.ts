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

@Entity({ name: "conciliation_systems" })
export class ConciliationSystem {
  @PrimaryGeneratedColumn({ name: "sys_id" })
  id!: number;

  @Column({ name: "sys_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "sys_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "sys_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => TemplateLayout, (templateLayout) => templateLayout.system)
  templateLayouts!: TemplateLayout[];

  @OneToMany(() => ReconciliationLayout, (layout) => layout.system)
  layouts!: ReconciliationLayout[];

  @CreateDateColumn({ name: "sys_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "sys_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
