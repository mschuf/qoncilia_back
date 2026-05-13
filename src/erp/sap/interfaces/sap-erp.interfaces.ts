import { ErpType } from "../../../common/enums/erp-type.enum"

export interface PublicSapExternalReconciliationResult {
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
  externalReconciliationNo: string | null
  externalReference: string | null
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

export interface PublicSapB1QueryTable {
  columns: string[]
  rows: Record<string, unknown>[]
}

export interface PublicSapB1QueryPreviewResult {
  companyErpConfigId: number
  companyErpConfigName: string
  companyDb: string
  accountCode: string
  dateFrom: string
  dateTo: string
  bank: PublicSapB1QueryTable
  system: PublicSapB1QueryTable
}

export type SapExternalReconciliationAccountType =
  | "rat_GLAccount"
  | "rat_BusinessPartner"

export interface SapExternalReconciliationBankStatementLinePayload
  extends Record<string, unknown> {
  BankStatementAccountCode: string
  Sequence: number
}

export interface SapExternalReconciliationJournalEntryLinePayload
  extends Record<string, unknown> {
  LineNumber: number
  TransactionNumber: number
}

export interface SapExternalReconciliationPayload extends Record<string, unknown> {
  ExternalReconciliation: {
    ReconciliationAccountType: SapExternalReconciliationAccountType
    ReconciliationBankStatementLines: SapExternalReconciliationBankStatementLinePayload[]
    ReconciliationJournalEntryLines: SapExternalReconciliationJournalEntryLinePayload[]
  }
}
