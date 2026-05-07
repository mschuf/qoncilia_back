import { ForbiddenException } from "@nestjs/common";
import { Role } from "../../common/enums/role.enum";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { User } from "../../users/entities/user.entity";

export function ensureActorCanAccessCompany(actor: AuthUser, companyId: number): void {
  if (actor.role === Role.IS_SUPER_ADMIN || actor.companyId === companyId) {
    return;
  }

  throw new ForbiddenException("No tenes permisos para ver datos de esta empresa.");
}

export function ensureActorCanAccessTargetUser(actor: AuthUser, targetUser: User): void {
  if (actor.role === Role.IS_SUPER_ADMIN) {
    return;
  }

  if (actor.role === Role.ADMIN && targetUser.company.id === actor.companyId) {
    return;
  }

  if (targetUser.id === actor.id) {
    return;
  }

  throw new ForbiddenException("No tenes permisos para ver datos de este usuario.");
}

export function ensureSuperadmin(actor: AuthUser) {
  if (actor.role !== Role.IS_SUPER_ADMIN) {
    throw new ForbiddenException("Solo el super admin puede administrar bancos y plantillas.");
  }
}

export function ensureAdminOrSuperadmin(actor: AuthUser) {
  if (actor.role !== Role.ADMIN && actor.role !== Role.IS_SUPER_ADMIN) {
    throw new ForbiddenException("Solo admin y superadmin pueden ejecutar esta accion.");
  }
}
