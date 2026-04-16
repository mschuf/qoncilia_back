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

@Entity({ name: "empresas" })
export class Company {
  @PrimaryGeneratedColumn({ name: "emp_id" })
  id!: number;

  @Column({ name: "emp_codigo", type: "varchar", length: 50, unique: true })
  code!: string;

  @Column({ name: "emp_nombre", type: "varchar", length: 160 })
  name!: string;

  @Column({ name: "emp_activa", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => User, (user) => user.company)
  users!: User[];

  @OneToMany(() => CompanyRoleModule, (companyRoleModule) => companyRoleModule.company)
  roleModules!: CompanyRoleModule[];

  @CreateDateColumn({ name: "emp_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "emp_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
