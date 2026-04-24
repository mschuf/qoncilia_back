import { PublicCompany } from "../../access-control/interfaces/access-control.interfaces";

export interface PublicBank {
  id: number;
  name: string;
  branch: string | null;
  active: boolean;
}

export interface PublicCompanyBankAccount {
  id: number;
  companyId: number;
  companyName: string;
  bankId: number;
  bankName: string;
  bankBranch: string | null;
  name: string;
  accountNumber: string;
  bankErpId: string;
  majorAccountNumber: string;
  paymentAccountNumber: string | null;
  active: boolean;
}

export interface CompanyBankingReferenceResponse {
  companies: PublicCompany[];
  banks: PublicBank[];
  accounts: PublicCompanyBankAccount[];
}
