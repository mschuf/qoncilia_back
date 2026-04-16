export interface PublicCompany {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export interface PublicRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface PublicAppModule {
  id: number;
  code: string;
  name: string;
  routePath: string;
  description: string | null;
  active: boolean;
}

export interface AccessControlReferenceResponse {
  companies: PublicCompany[];
  roles: PublicRole[];
  modules: PublicAppModule[];
}

export interface CompanyRoleMatrixRow {
  role: PublicRole;
  modules: Array<{
    moduleId: number;
    moduleCode: string;
    enabled: boolean;
  }>;
}

export interface CompanyRoleMatrixResponse {
  company: PublicCompany;
  modules: PublicAppModule[];
  rows: CompanyRoleMatrixRow[];
}
