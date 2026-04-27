export type CompareOperator =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "numeric_equals"
  | "date_equals";

export type LayoutDataType = "text" | "number" | "amount" | "date";

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
  layout: PublicLayout;
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
}

export interface DeleteUserBankResponse {
  message: string;
  deletedLayouts: number;
  deletedAccounts: number;
  deletedReconciliations: number;
}

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
  layoutId: number;
  layoutName: string;
  systemFileName: string | null;
  bankFileName: string | null;
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
    layoutName: string;
    matchPercentage: number;
    autoMatches: number;
    manualMatches: number;
    unmatchedSystem: number;
    unmatchedBank: number;
    createdAt: Date;
  }>;
}
