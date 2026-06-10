import { PublicCompany } from "../../access-control/interfaces/access-control.interfaces";

export interface PublicBank {
  id: number;
  companyId: number;
  userId: number;
  userLogin: string;
  name: string;
  description: string | null;
  branch: string | null;
  active: boolean;
  accountCount: number;
  activeLayoutId: number | null;
  activeLayoutName: string | null;
}

export interface PublicCompanyBankAccount {
  id: number;
  companyId: number;
  companyName: string;
  bankId: number;
  bankName: string;
  bankBranch: string | null;
  name: string;
  currency: string;
  accountNumber: string;
  bankErpId: string;
  majorAccountNumber: string;
  paymentAccountNumber: string | null;
  active: boolean;
}

export interface PublicCurrency {
  id: number;
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  active: boolean;
}

export interface CompanyBankingReferenceResponse {
  companies: PublicCompany[];
  banks: PublicBank[];
  accounts: PublicCompanyBankAccount[];
  currencies: PublicCurrency[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}
