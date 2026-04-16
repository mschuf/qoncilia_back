import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { CompanyRoleModule } from "./company-role-module.entity";

@Entity({ name: "modulos" })
export class AppModuleEntity {
  @PrimaryGeneratedColumn({ name: "mod_id" })
  id!: number;

  @Column({ name: "mod_codigo", type: "varchar", length: 80, unique: true })
  code!: string;

  @Column({ name: "mod_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "mod_ruta", type: "varchar", length: 160, unique: true })
  routePath!: string;

  @Column({ name: "mod_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "mod_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => CompanyRoleModule, (companyRoleModule) => companyRoleModule.module)
  companyRoleModules!: CompanyRoleModule[];

  @CreateDateColumn({ name: "mod_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "mod_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
