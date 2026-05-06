import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { TemplateLayout } from "./template-layout.entity";

@Entity({ name: "usuarios_plantillas_base_disponibles" })
@Unique("uq_usuarios_plantillas_base_disponibles_usuario_plantilla", [
  "user",
  "templateLayout"
])
export class UserTemplateAvailability {
  @PrimaryGeneratedColumn({ name: "usuario_plantilla_disponible_id" })
  id!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "usuario_id", referencedColumnName: "id" })
  user!: User;

  @ManyToOne(() => TemplateLayout, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "plantilla_base_id", referencedColumnName: "id" })
  templateLayout!: TemplateLayout;

  @CreateDateColumn({ name: "disponible_creado_en", type: "timestamptz" })
  createdAt!: Date;
}
