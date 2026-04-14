export interface PublicCompanyBank {
  id: number;
  bancoNombre: string;
  tipoCuenta: string;
  moneda: string;
  numeroCuenta: string;
  titular: string | null;
  sucursal: string | null;
  activo: boolean;
}

export interface PublicCompany {
  id: number;
  nombre: string;
  ruc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  bancos: PublicCompanyBank[];
}

export interface CompanyOption {
  id: number;
  nombre: string;
}
