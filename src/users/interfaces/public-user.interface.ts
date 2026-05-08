import { Role } from "../../common/enums/role.enum";

export interface PublicUser {
  id: number;
  usrNombre: string | null;
  usrApellido: string | null;
  usrEmail: string | null;
  usrCelular: string | null;
  usrLogin: string;
  usrLegajo: string;
  usrFoto: string | null;
  activo: boolean;
  roleId: number;
  roleCode: Role;
  roleName: string;
  companyId: number;
  companyCode: string;
  companyName: string;
  companyLogo: string | null;
  enabledModules: string[];
  role: Role;
  creatorUserId: number | null;
  creatorUserLogin: string | null;
}
