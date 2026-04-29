import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { BankStatement } from "./bank-statement.entity";

@Entity({ name: "extractos_bancarios_filas" })
export class BankStatementRow {
  @PrimaryGeneratedColumn({ name: "extracto_fila_id" })
  id!: number;

  @ManyToOne(() => BankStatement, (statement) => statement.rows, {
    nullable: false,
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "extracto_id", referencedColumnName: "id" })
  statement!: BankStatement;

  @Column({ name: "extracto_fila_origen_id", type: "varchar", length: 120 })
  sourceRowId!: string;

  @Column({ name: "extracto_numero_fila", type: "integer" })
  rowNumber!: number;

  @Column({ name: "extracto_valores", type: "jsonb" })
  values!: Record<string, string | null>;

  @Column({ name: "extracto_normalizados", type: "jsonb" })
  normalized!: Record<string, string | number | null>;

  @CreateDateColumn({ name: "extracto_fila_creada_en", type: "timestamptz" })
  createdAt!: Date;
}
