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
import { User } from "../../users/entities/user.entity";
import { Reconciliation } from "./reconciliation.entity";
import { ReconciliationLayout } from "./reconciliation-layout.entity";

@Entity({ name: "usuarios_bancos" })
export class UserBank {
  @PrimaryGeneratedColumn({ name: "ubk_id" })
  id!: number;

  @ManyToOne(() => User, (user) => user.bancos, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usr_id", referencedColumnName: "id" })
  user!: User;

  @Column({ name: "ubk_banco_nombre", type: "varchar", length: 120 })
  bankName!: string;

  @Column({ name: "ubk_alias", type: "varchar", length: 120, nullable: true })
  alias!: string | null;

  @Column({ name: "ubk_moneda", type: "varchar", length: 20 })
  currency!: string;

  @Column({ name: "ubk_numero_cuenta", type: "varchar", length: 80, nullable: true })
  accountNumber!: string | null;

  @Column({ name: "ubk_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "ubk_activo", type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => ReconciliationLayout, (layout) => layout.userBank)
  layouts!: ReconciliationLayout[];

  @OneToMany(() => Reconciliation, (reconciliation) => reconciliation.userBank)
  reconciliations!: Reconciliation[];

  @CreateDateColumn({ name: "ubk_created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "ubk_updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
