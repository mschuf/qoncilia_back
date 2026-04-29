import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique
} from "typeorm";
import { BankEntity } from "./bank.entity";
import { TemplateLayout } from "./template-layout.entity";

@Entity({ name: "bancos_plantillas_base_disponibles" })
@Unique("uq_bancos_plantillas_base_disponibles_banco_plantilla", [
  "bank",
  "templateLayout"
])
export class BankTemplateAvailability {
  @PrimaryGeneratedColumn({ name: "banco_plantilla_disponible_id" })
  id!: number;

  @ManyToOne(() => BankEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "banco_id", referencedColumnName: "id" })
  bank!: BankEntity;

  @ManyToOne(() => TemplateLayout, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "plantilla_base_id", referencedColumnName: "id" })
  templateLayout!: TemplateLayout;

  @CreateDateColumn({ name: "disponible_creado_en", type: "timestamptz" })
  createdAt!: Date;
}
