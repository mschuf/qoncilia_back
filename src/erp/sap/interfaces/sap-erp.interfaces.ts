import { ErpType } from "../../../common/enums/erp-type.enum"

export interface PublicSapErpShipmentResult {
  id: number
  reconciliationId: number | null
  companyErpConfigId: number
  companyErpConfigName: string
  documentType: string
  status: string
  endpoint: string | null
  httpStatus: number | null
  responsePayload: Record<string, unknown> | null
  errorMessage: string | null
  externalDocEntry: string | null
  externalDocNum: string | null
  createdAt: Date
  updatedAt: Date
}

export type PublicSapSessionStatus =
  | "active"
  | "not_authenticated"
  | "expired"
  | "invalid"
  | "logged_out"

export interface PublicSapErpSession {
  companyErpConfigId: number
  companyErpConfigName: string
  erpType: ErpType
  authenticated: boolean
  status: PublicSapSessionStatus
  username: string | null
  expiresAt: Date | null
  lastValidatedAt: Date | null
  checkedAt: Date
}

export interface SapCreditDepositLinePayload extends Record<string, unknown> {
  AbsId: number
  CreditCard: number
  VoucherNumber: string
  PaymentMethodCode: number
  PayDate: string
  Deposited: "tNO"
  NumOfPayments: number
  Customer: string
  Reference: string | null
  Transferred: "tNO"
  Total: number
  CreditCurrency: string
}

export interface SapCreditDepositPayload extends Record<string, unknown> {
  DepositType: "dtCredit"
  DepositDate: string
  DepositCurrency: string
  DepositAccount: string
  DepositorName: null
  Bank: string
  BankAccountNum: string
  BankBranch: string
  BankReference: string
  JournalRemarks: string
  TotalLC: number
  TotalFC: number
  TotalSC: number
  AllocationAccount: string
  DocRate: number
  TaxAccount: string
  TaxAmount: number
  CommissionAccount: null
  Commission: number
  CommissionDate: null
  TaxCode: string
  DepositAccountType: "datBankAccount"
  ReconcileAfterDeposit: "tYES"
  VoucherAccount: string
  Series: number | null
  CommissionCurrency: string
  CommissionSC: number
  CommissionFC: number
  TaxAmountSC: number
  TaxAmountFC: number
  BPLID: number | null
  CheckDepositType: "cdtCashChecks"
  AttachmentEntry: number | null
  IncomeTaxAccount: string | null
  IncomeTaxAmount: number
  IncomeTaxAmountSC: number
  IncomeTaxAmountFC: number
  CheckLines: []
  CreditLines: SapCreditDepositLinePayload[]
  BOELines: []
}
