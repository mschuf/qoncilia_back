import { ErpType } from "../../../common/enums/erp-type.enum"
import type { ConciliationPreviewRow } from "../../../conciliation/interfaces/conciliation.interfaces"

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

// Resultado del query del sistema (OCRH) en el modo SAP_TARJETAS. Espeja la
// parte "system" de PublicSapB1QueryPreviewResult, sin lado "bank" (ese lado lo
// aporta el CSV de la procesadora subido aparte).
export interface PublicSapTarjetasSystemQueryResult {
  companyErpConfigId: number
  companyErpConfigName: string
  companyDb: string
  accountCode: string | null
  // "Cuenta Pago ERP" de la cuenta bancaria: viaja como BankAccountNum en el deposito.
  paymentAccountCode: string | null
  // Descripcion del banco: viaja como Bank (cabecera) en el deposito.
  bankName: string | null
  // Sucursal de la CUENTA bancaria (no la del banco): viaja como BankBranch.
  bankBranch: string | null
  dateFrom: string
  dateTo: string
  system: PublicSapB1QueryTable
}

// Resultado de parsear el archivo de la procesadora. El archivo no se guarda:
// includedRows = operaciones de debito y credito incluidas para comparar contra el sistema.
export interface PublicSapTarjetasCsvParseResult {
  fileName: string
  totalRows: number
  includedRows: number
  bank: PublicSapB1QueryTable
}

export interface PublicSapB1SmartMatch {
  systemRow: ConciliationPreviewRow
  bankRow: ConciliationPreviewRow
  score: number
  column1Match: boolean
  column2Match: boolean
  column3Match: boolean
  matchReason: "reference" | "date_amount"
  dateDifferenceDays: number | null
}

export interface PublicSapB1QueryComparisonResult {
  columns: string[]
  matches: PublicSapB1SmartMatch[]
  unmatchedSystemRows: ConciliationPreviewRow[]
  unmatchedBankRows: ConciliationPreviewRow[]
  metrics: {
    totalSystemRows: number
    totalBankRows: number
    matches: number
    unmatchedSystem: number
    unmatchedBank: number
    matchPercentage: number
  }
}

export type SapExternalReconciliationAccountType =
  | "rat_Account"
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

export interface SapExternalReconciliationDocument extends Record<string, unknown> {
  ReconciliationAccountType: SapExternalReconciliationAccountType
  AccountCode?: string
  ReconciliationBankStatementLines: SapExternalReconciliationBankStatementLinePayload[]
  ReconciliationJournalEntryLines: SapExternalReconciliationJournalEntryLinePayload[]
}

export interface SapExternalReconciliationPayload extends Record<string, unknown> {
  ExternalReconciliation: SapExternalReconciliationDocument
}

export interface SapTarjetasDepositCreditLinePayload extends Record<string, unknown> {
  AbsId: number
}

export interface SapTarjetasDepositPayload extends Record<string, unknown> {
  CreditLines: SapTarjetasDepositCreditLinePayload[]
  DepositAccount: string
  DepositType: "dtCredit"
  // SAP puede reconciliar automaticamente los importes al crear el deposito.
  ReconcileAfterDeposit: "tYES" | "tNO"
  VoucherAccount: string
  // Cabecera: fecha del deposito, formato "YYYY-MM-DDT00:00:00Z".
  DepositDate: string
  JournalRemarks: string
  // Referencia bancaria editable, exclusiva de credito OCHO A.
  BankReference?: string
  // Cabecera: "Cuenta Pago ERP" de la cuenta bancaria. Se omite si no esta configurada.
  BankAccountNum?: string
  // Cabecera: descripcion del banco. Se omite si no esta configurada.
  Bank?: string
  // Cabecera: sucursal de la cuenta bancaria. Se omite si no esta configurada.
  BankBranch?: string
  // Campos de comision para los depositos de credito especializados.
  CommissionAccount?: string
  Commission?: number
  CommissionDate?: string
  TaxCode?: string
  DepositAccountType?: "datBankAccount"
}

// Deposito masivo: se crea UN deposito en SAP con todos los AbsId del lote en
// CreditLines. El resultado conserva el detalle por AbsId para que el front pueda
// mantener los fallidos y reintentar solo ese lote.
export interface PublicSapTarjetasDepositItemResult {
  absId: number
  status: "success" | "error"
  httpStatus: number | null
  externalReference: string | null
  errorMessage: string | null
}

export interface PublicSapTarjetasBulkDepositResult {
  companyErpConfigId: number
  companyErpConfigName: string
  endpoint: string
  total: number
  succeeded: number
  failed: number
  results: PublicSapTarjetasDepositItemResult[]
}
