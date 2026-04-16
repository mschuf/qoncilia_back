import { Role } from "../enums/role.enum";

export function isSuperAdminRole(roleCode: Role | string | null | undefined): boolean {
  return roleCode === Role.IS_SUPER_ADMIN;
}

export function isGestorRole(roleCode: Role | string | null | undefined): boolean {
  return roleCode === Role.GESTOR_COBRANZA || roleCode === Role.GESTOR_PAGOS;
}
