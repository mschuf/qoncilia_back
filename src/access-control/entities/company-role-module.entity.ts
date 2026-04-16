import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from "typeorm";
import { AppModuleEntity } from "./app-module.entity";
import { Company } from "./company.entity";
import { UserRole } from "./user-role.entity";

@Entity({ name: "empresas_roles_modulos" })
@Unique("uq_erm_empresa_rol_modulo", ["company", "role", "module"])
export class CompanyRoleModule {
  @PrimaryGeneratedColumn({ name: "erm_id" })
  id!: number;

  @ManyToOne(() => Company, (company) => company.roleModules, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  company!: Company;

  @ManyToOne(() => UserRole, (role) => role.companyRoleModules, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "rol_id", referencedColumnName: "id" })
  role!: UserRole;

  @ManyToOne(() => AppModuleEntity, (module) => module.companyRoleModules, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "mod_id", referencedColumnName: "id" })
  module!: AppModuleEntity;

  @Column({ name: "erm_habilitado", type: "boolean", default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: "erm_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "erm_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
