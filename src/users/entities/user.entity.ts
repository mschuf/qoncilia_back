import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { Company } from "../../companies/entities/company.entity";

@Entity({ name: "usuarios" })
export class User {
  @PrimaryGeneratedColumn({ name: "usr_id" })
  id!: number;

  @Column({ name: "usr_nombre", type: "varchar", length: 120, nullable: true })
  usrNombre!: string | null;

  @Column({ name: "usr_apellido", type: "varchar", length: 120, nullable: true })
  usrApellido!: string | null;

  @Column({ name: "usr_email", type: "varchar", length: 160, nullable: true, unique: true })
  usrEmail!: string | null;

  @Column({ name: "usr_celular", type: "varchar", length: 40, nullable: true, unique: true })
  usrCelular!: string | null;

  @Column({ name: "usr_login", type: "varchar", length: 80, unique: true })
  usrLogin!: string;

  @Column({ name: "usr_legajo", type: "varchar", length: 50, unique: true })
  usrLegajo!: string;

  @Column({ name: "usr_password_hash", type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ name: "usr_activo", type: "boolean", default: false })
  activo!: boolean;

  @Column({ name: "usr_is_admin", type: "boolean", default: false })
  isAdmin!: boolean;

  @Column({ name: "usr_is_super_admin", type: "boolean", default: false })
  isSuperAdmin!: boolean;

  @ManyToOne(() => Company, (company) => company.usuarios, { nullable: false })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  empresa!: Company;

  @CreateDateColumn({ name: "usr_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "usr_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
