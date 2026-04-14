import { Role } from "../../common/enums/role.enum";

export interface PublicUserCompany {
  id: number;
  nombre: string;
  ruc: string | null;
}

export interface PublicUser {
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
