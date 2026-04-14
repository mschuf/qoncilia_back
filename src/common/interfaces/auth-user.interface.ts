import { Role } from "../enums/role.enum";
import { PublicUserCompany } from "../../users/interfaces/public-user.interface";

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
  empresa: PublicUserCompany;
}
