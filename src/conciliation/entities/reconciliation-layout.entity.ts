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
import { Reconciliation } from "./reconciliation.entity";
import { ConciliationSystem } from "./conciliation-system.entity";
import { ReconciliationLayoutMapping } from "./reconciliation-layout-mapping.entity";
import { TemplateLayout } from "./template-layout.entity";
import { BankEntity } from "./bank.entity";
import { BankStatement } from "./bank-statement.entity";

@Entity({ name: "plantillas_conciliacion" })
export class ReconciliationLayout {
  @PrimaryGeneratedColumn({ name: "plantilla_id" })
  id!: number;

  @ManyToOne(() => BankEntity, (bank) => bank.layouts, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "banco_id", referencedColumnName: "id" })
  userBank!: BankEntity;

  @ManyToOne(() => TemplateLayout, (templateLayout) => templateLayout.layouts, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "plantilla_base_id", referencedColumnName: "id" })
  templateLayout!: TemplateLayout | null;

  @ManyToOne(() => ConciliationSystem, (system) => system.layouts, {
    nullable: false,
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "sistema_id", referencedColumnName: "id" })
  system!: ConciliationSystem;

  @Column({ name: "plantilla_nombre", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "plantilla_descripcion", type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ name: "plantilla_etiqueta_sistema", type: "varchar", length: 120, default: "Sistema" })
  systemLabel!: string;

  @Column({ name: "plantilla_etiqueta_banco", type: "varchar", length: 120, default: "Banco" })
  bankLabel!: string;

  @Column({ name: "plantilla_umbral_auto_match", type: "double precision", default: 1 })
  autoMatchThreshold!: number;

  @Column({ name: "plantilla_activa", type: "boolean", default: false })
  active!: boolean;

  @OneToMany(() => ReconciliationLayoutMapping, (mapping) => mapping.layout)
  mappings!: ReconciliationLayoutMapping[];

  @OneToMany(() => Reconciliation, (reconciliation) => reconciliation.layout)
  reconciliations!: Reconciliation[];

  @OneToMany(() => BankStatement, (statement) => statement.layout)
  statements!: BankStatement[];

  @CreateDateColumn({ name: "plantilla_creada_en", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "plantilla_actualizada_en", type: "timestamptz" })
  updatedAt!: Date;
}
