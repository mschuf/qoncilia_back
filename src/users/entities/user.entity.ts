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
import { Company } from "../../access-control/entities/company.entity";
import { UserRole } from "../../access-control/entities/user-role.entity";
import { BankEntity } from "../../conciliation/entities/bank.entity";

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

  @ManyToOne(() => Company, (company) => company.users, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "emp_id", referencedColumnName: "id" })
  company!: Company;

  @ManyToOne(() => UserRole, (role) => role.users, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "rol_id", referencedColumnName: "id" })
  role!: UserRole;

  @ManyToOne(() => User, (user) => user.createdUsers, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "usr_created_by", referencedColumnName: "id" })
  creatorUser!: User | null;

  @OneToMany(() => BankEntity, (bank) => bank.user)
  banks!: BankEntity[];

  @OneToMany(() => User, (user) => user.creatorUser)
  createdUsers!: User[];

  @CreateDateColumn({ name: "usr_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "usr_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
