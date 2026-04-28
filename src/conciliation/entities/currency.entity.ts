import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "monedas" })
export class Currency {
  @PrimaryGeneratedColumn({ name: "moneda_id" })
  id!: number;

  @Column({ name: "moneda_codigo", type: "varchar", length: 10, unique: true })
  code!: string;

  @Column({ name: "moneda_nombre", type: "varchar", length: 80 })
  name!: string;

  @Column({ name: "moneda_simbolo", type: "varchar", length: 10, nullable: true })
  symbol!: string | null;

  @Column({ name: "moneda_decimales", type: "integer", default: 0 })
  decimals!: number;

  @Column({ name: "moneda_activa", type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "moneda_creado_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "moneda_actualizado_en", type: "timestamptz" })
  updatedAt!: Date;
}
