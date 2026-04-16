import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { CompanyRoleModule } from "./company-role-module.entity";

@Entity({ name: "roles" })
export class UserRole {
  @PrimaryGeneratedColumn({ name: "rol_id" })
  id!: number;

  @Column({ name: "rol_codigo", type: "varchar", length: 50, unique: true })
  code!: string;

  @Column({ name: "rol_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "rol_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "rol_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => User, (user) => user.role)
  users!: User[];

  @OneToMany(() => CompanyRoleModule, (companyRoleModule) => companyRoleModule.role)
  companyRoleModules!: CompanyRoleModule[];

  @CreateDateColumn({ name: "rol_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "rol_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
