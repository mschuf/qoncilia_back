import { Role } from "../enums/role.enum";

type RoleFlags = {
  activo: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export function resolveRoleFromFlags({ activo, isAdmin, isSuperAdmin }: RoleFlags): Role {
  if (activo && isSuperAdmin) {
    return Role.SUPERADMIN;
  }

  if (activo && isAdmin) {
    return Role.ADMIN;
  }

  return Role.GESTOR;
}

