export type CompareOperator =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "numeric_equals"
  | "date_equals";

export type LayoutDataType = "text" | "number" | "amount" | "date";

export interface PublicConciliationSystem {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
}

export interface PublicCompanyBankAccountSummary {
  id: number;
  bankId: number;
  bankName: string;
  bankAlias: string | null;
  name: string;
  currency: string;
  accountNumber: string;
  active: boolean;
}

export interface PublicUserBankSummary {
  id: number;
  bankName: string;
  alias: string | null;
  branch: string | null;
  description: string | null;
  active: boolean;
}

export interface PublicUserBank extends PublicUserBankSummary {
  userId: number;
  userLogin: string;
}

export interface PublicLayoutMapping {
  id: number;
  fieldKey: string;
  label: string;
  active: boolean;
  required: boolean;
  compareOperator: CompareOperator;
  weight: number;
  tolerance: number | null;
  sortOrder: number;
  systemSheet: string | null;
  systemColumn: string | null;
  systemStartRow: number | null;
  systemEndRow: number | null;
  systemDataType: LayoutDataType;
  bankSheet: string | null;
  bankColumn: string | null;
  bankStartRow: number | null;
  bankEndRow: number | null;
  bankDataType: LayoutDataType;
}

export interface PublicLayout {
  id: number;
  userBankId: number;
  templateLayoutId: number | null;
  systemId: number;
  systemName: string;
  name: string;
  description: string | null;
  systemLabel: string;
  bankLabel: string;
  autoMatchThreshold: number;
  active: boolean;
  mappings: PublicLayoutMapping[];
}

export interface PublicTemplateLayout {
  id: number;
  systemId: number;
  systemName: string;
  name: string;
  description: string | null;
  referenceBankName: string | null;
  systemLabel: string;
  bankLabel: string;
  autoMatchThreshold: number;
  active: boolean;
  mappings: PublicLayoutMapping[];
}

export interface ConciliationPreviewRow {
  rowId: string;
  rowNumber: number;
  values: Record<string, string | null>;
  normalized: Record<string, string | number | null>;
}

export interface ConciliationRuleResult {
  fieldKey: string;
  label: string;
  passed: boolean;
  compareOperator: CompareOperator;
  systemValue: string | number | null;
  bankValue: string | number | null;
}

export interface ConciliationPreviewMatch {
  systemRowId: string;
  bankRowId: string;
  systemRowNumber: number;
  bankRowNumber: number;
  score: number;
  status: "auto" | "manual";
  ruleResults: ConciliationRuleResult[];
}

export interface ConciliationPreviewResponse {
  userBank: PublicUserBankSummary;
  companyBankAccount: PublicCompanyBankAccountSummary;
  layout: PublicLayout;
  bankStatement?: PublicBankStatementSummary;
  systemFileName: string;
  bankFileName: string;
  systemRows: ConciliationPreviewRow[];
  bankRows: ConciliationPreviewRow[];
  autoMatches: ConciliationPreviewMatch[];
  manualMatches: ConciliationPreviewMatch[];
  unmatchedSystemRows: ConciliationPreviewRow[];
  unmatchedBankRows: ConciliationPreviewRow[];
  metrics: {
    totalSystemRows: number;
    totalBankRows: number;
    autoMatches: number;
    manualMatches: number;
    unmatchedSystem: number;
    unmatchedBank: number;
    matchPercentage: number;
  };
}

export interface PublicUserBankWithLayouts extends PublicUserBank {
  accounts: PublicCompanyBankAccountSummary[];
  layouts: PublicLayout[];
}

export interface PublicUserBankDeletionLayout {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
}

export interface PublicUserBankDeletionAccount {
  id: number;
  name: string;
  currency: string;
  accountNumber: string;
  bankErpId: string;
  majorAccountNumber: string;
  paymentAccountNumber: string | null;
  active: boolean;
}

export interface PublicUserBankDeletionPreview {
  bank: PublicUserBank;
  layouts: PublicUserBankDeletionLayout[];
  accounts: PublicUserBankDeletionAccount[];
  reconciliationCount: number;
  bankStatementCount: number;
}

export interface DeleteUserBankResponse {
  message: string;
  deletedLayouts: number;
  deletedAccounts: number;
  deletedReconciliations: number;
  deletedBankStatements: number;
}

export type ReconciliationSource = "system" | "bank";

export interface PublicReconciliationSummary {
  id: number;
  name: string;
  status: string;
  updateCount: number;
  userId: number;
  userLogin: string;
  userBankId: number;
  bankName: string;
  bankAlias: string | null;
  companyBankAccountId: number | null;
  companyBankAccountName: string | null;
  companyBankAccountNumber: string | null;
  companyBankAccountCurrency: string | null;
  layoutId: number;
  layoutName: string;
  systemId: number;
  systemName: string;
  systemFileName: string | null;
  bankFileName: string | null;
  hasSystemData: boolean;
  hasBankData: boolean;
  totalSystemRows: number;
  totalBankRows: number;
  autoMatches: number;
  manualMatches: number;
  unmatchedSystem: number;
  unmatchedBank: number;
  matchPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReconciliationSnapshot {
  userBank: PublicUserBankSummary;
  companyBankAccount: PublicCompanyBankAccountSummary;
  layout: PublicLayout;
  systemRows: ConciliationPreviewRow[];
  bankRows: ConciliationPreviewRow[];
  autoMatches: ConciliationPreviewMatch[];
  manualMatches: ConciliationPreviewMatch[];
  unmatchedSystemRows: ConciliationPreviewRow[];
  unmatchedBankRows: ConciliationPreviewRow[];
  metrics: {
    totalSystemRows: number;
    totalBankRows: number;
    autoMatches: number;
    manualMatches: number;
    unmatchedSystem: number;
    unmatchedBank: number;
    matchPercentage: number;
  };
}

export interface PublicReconciliationDetail extends PublicReconciliationSummary {
  summarySnapshot: ReconciliationSnapshot | null;
}

export interface DeleteReconciliationResponse {
  id: number;
  message: string;
}

export interface PublicGestorAssignmentCatalog {
  gestorUsers: Array<{
    id: number;
    login: string;
    fullName: string | null;
    creatorUserId: number | null;
    creatorUserLogin: string | null;
  }>;
  sourceBanks: PublicUserBankWithLayouts[];
}

export interface SyncGestorBankAssignmentResponse {
  gestorUserId: number;
  sourceBankId: number;
  targetBankId: number;
  targetBankName: string;
  syncedLayoutIds: number[];
  syncedAccountIds: number[];
}

export interface ConciliationKpiResponse {
  totalReconciliations: number;
  totalAutoMatches: number;
  totalManualMatches: number;
  totalUnmatchedSystem: number;
  totalUnmatchedBank: number;
  averageMatchPercentage: number;
  bankBreakdown: Array<{
    userBankId: number;
    bankName: string;
    alias: string | null;
    totalReconciliations: number;
    averageMatchPercentage: number;
  }>;
  recentReconciliations: Array<{
    id: number;
    name: string;
    bankName: string;
    alias: string | null;
    companyBankAccountName: string | null;
    companyBankAccountNumber: string | null;
    layoutName: string;
    systemName: string;
    matchPercentage: number;
    autoMatches: number;
    manualMatches: number;
    unmatchedSystem: number;
    unmatchedBank: number;
    createdAt: Date;
  }>;
}

export interface PublicBankStatementSummary {
  id: number;
  name: string;
  fileName: string;
  status: string;
  rowCount: number;
  userId: number;
  userLogin: string;
  userBankId: number;
  bankName: string;
  bankAlias: string | null;
  companyBankAccountId: number;
  companyBankAccountName: string;
  companyBankAccountNumber: string;
  companyBankAccountCurrency: string;
  layoutId: number;
  layoutName: string;
  systemId: number;
  systemName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicBankStatementDetail extends PublicBankStatementSummary {
  userBank: PublicUserBankSummary;
  companyBankAccount: PublicCompanyBankAccountSummary;
  layout: PublicLayout;
  rows: ConciliationPreviewRow[];
}

export interface BankStatementPreviewResponse {
  userBank: PublicUserBankSummary;
  companyBankAccount: PublicCompanyBankAccountSummary;
  layout: PublicLayout;
  fileName: string;
  rowCount: number;
  rows: ConciliationPreviewRow[];
}
