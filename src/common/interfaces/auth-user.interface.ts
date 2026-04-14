import { Role } from "../enums/role.enum";

export interface AuthUser {
  id: number;
  usrNombre: string | null;
  usrApellido: string | null;
  usrEmail: string | null;
  usrCelular: string | null;
  usrLogin: string;
  usrLegajo: string;
  activo: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: Role;
}
