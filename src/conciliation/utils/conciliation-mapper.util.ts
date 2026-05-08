import { BadRequestException } from "@nestjs/common";
import { BankStatement } from "../entities/bank-statement.entity";
import { BankStatementRow } from "../entities/bank-statement-row.entity";
import { BankEntity } from "../entities/bank.entity";
import { CompanyBankAccount } from "../entities/company-bank-account.entity";
import { ConciliationSystem } from "../entities/conciliation-system.entity";
import { ReconciliationLayoutMapping } from "../entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "../entities/reconciliation-layout.entity";
import { TemplateLayoutMapping } from "../entities/template-layout-mapping.entity";
import { TemplateLayout } from "../entities/template-layout.entity";
import {
  CompareOperator,
  ConciliationPreviewRow,
  PublicBankStatementDetail,
  PublicBankStatementSummary,
  PublicCompanyBankAccountSummary,
  PublicConciliationSystem,
  PublicLayout,
  PublicLayoutMapping,
  PublicTemplateLayout,
  PublicUserBank,
  PublicUserBankDeletionAccount,
  PublicUserBankDeletionLayout,
  PublicUserBankSummary,
  PublicUserBankWithLayouts
} from "../interfaces/conciliation.interfaces";
import { sortPreviewRows } from "./conciliation-workbook.util";
import { sortLayouts, sortMappings, sortTemplateMappings } from "./conciliation-value.util";

export function toPublicUserBankWithLayouts(
  entity: BankEntity,
  availableTemplateIds: number[] = []
): PublicUserBankWithLayouts {
  return {
    ...toPublicUserBank(entity),
    accounts: [...(entity.accounts ?? [])]
      .sort((left, right) => {
        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) return byName;
        return left.id - right.id;
      })
      .map((account) => toPublicCompanyBankAccountSummary(account, entity)),
    layouts: sortLayouts(entity.layouts ?? []).map((layout) =>
      toPublicLayout(layout, entity.id)
    ),
    availableTemplateIds: [...availableTemplateIds].sort((a, b) => a - b)
  };
}

export function toPublicUserBank(entity: BankEntity): PublicUserBank {
  return {
    ...toPublicUserBankSummary(entity),
    userId: entity.user.id,
    userLogin: entity.user.usrLogin
  };
}

export function toPublicUserBankSummary(entity: BankEntity): PublicUserBankSummary {
  return {
    id: entity.id,
    bankName: entity.bankName,
    branch: entity.branch,
    description: entity.description,
    active: entity.active
  };
}

export function toPublicLayout(
  entity: ReconciliationLayout,
  fallbackUserBankId?: number
): PublicLayout {
  const resolvedUserBankId = entity.userBank?.id ?? fallbackUserBankId;
  if (!resolvedUserBankId) {
    throw new BadRequestException("No se pudo resolver el banco asociado de la plantilla.");
  }

  return {
    id: entity.id,
    userBankId: resolvedUserBankId,
    templateLayoutId: entity.templateLayout?.id ?? null,
    systemId: entity.system?.id ?? 0,
    systemName: entity.system?.name ?? entity.systemLabel,
    name: entity.name,
    description: entity.description,
    systemLabel: entity.system?.name ?? entity.systemLabel,
    bankLabel: entity.bankLabel,
    autoMatchThreshold: entity.autoMatchThreshold,
    active: entity.active,
    mappings: sortMappings(entity.mappings ?? []).map((mapping) =>
      toPublicLayoutMapping(mapping)
    )
  };
}

export function toPublicTemplateLayout(entity: TemplateLayout): PublicTemplateLayout {
  return {
    id: entity.id,
    systemId: entity.system?.id ?? 0,
    systemName: entity.system?.name ?? entity.systemLabel,
    name: entity.name,
    description: entity.description,
    referenceBankName: entity.referenceBankName,
    systemLabel: entity.system?.name ?? entity.systemLabel,
    bankLabel: entity.bankLabel,
    autoMatchThreshold: entity.autoMatchThreshold,
    active: entity.active,
    mappings: sortTemplateMappings(entity.mappings ?? []).map((mapping) =>
      toPublicLayoutMapping(mapping)
    )
  };
}

export function toPublicUserBankDeletionLayout(
  entity: ReconciliationLayout
): PublicUserBankDeletionLayout {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    active: entity.active
  };
}

export function toPublicUserBankDeletionAccount(
  entity: CompanyBankAccount
): PublicUserBankDeletionAccount {
  return {
    id: entity.id,
    name: entity.name,
    currency: entity.currency,
    accountNumber: entity.accountNumber,
    bankErpId: entity.bankErpId,
    majorAccountNumber: entity.majorAccountNumber,
    paymentAccountNumber: entity.paymentAccountNumber,
    active: entity.active
  };
}

export function toPublicLayoutMapping(
  entity: ReconciliationLayoutMapping | TemplateLayoutMapping
): PublicLayoutMapping {
  return {
    id: entity.id,
    fieldKey: entity.fieldKey,
    label: entity.label,
    active: entity.active,
    required: entity.required,
    compareOperator: entity.compareOperator as CompareOperator,
    weight: entity.weight,
    tolerance: entity.tolerance,
    sortOrder: entity.sortOrder,
    systemSheet: entity.systemSheet,
    systemColumn: entity.systemColumn,
    systemStartRow: entity.systemStartRow,
    systemEndRow: entity.systemEndRow,
    systemDataType: entity.systemDataType as PublicLayoutMapping["systemDataType"],
    bankSheet: entity.bankSheet,
    bankColumn: entity.bankColumn,
    bankStartRow: entity.bankStartRow,
    bankEndRow: entity.bankEndRow,
    bankDataType: entity.bankDataType as PublicLayoutMapping["bankDataType"]
  };
}

export function toPublicSystem(entity: ConciliationSystem): PublicConciliationSystem {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    active: entity.active
  };
}

export function toPublicCompanyBankAccountSummary(
  entity: CompanyBankAccount,
  fallbackBank?: BankEntity
): PublicCompanyBankAccountSummary {
  const bank = entity.bank ?? fallbackBank;
  if (!bank) {
    throw new BadRequestException("No se pudo resolver el banco asociado a la cuenta bancaria.");
  }

  return {
    id: entity.id,
    bankId: bank.id,
    bankName: bank.name,
    name: entity.name,
    currency: entity.currency,
    accountNumber: entity.accountNumber,
    active: entity.active
  };
}

export function toPreviewRow(entity: BankStatementRow): ConciliationPreviewRow {
  return {
    rowId: entity.sourceRowId,
    rowNumber: entity.rowNumber,
    values: entity.values ?? {},
    normalized: entity.normalized ?? {}
  };
}

export function toPublicBankStatementSummary(entity: BankStatement): PublicBankStatementSummary {
  return {
    id: entity.id,
    name: entity.name,
    fileName: entity.fileName,
    status: entity.status,
    rowCount: entity.rowCount,
    userId: entity.user.id,
    userLogin: entity.user.usrLogin,
    userBankId: entity.userBank.id,
    bankName: entity.userBank.bankName,
    companyBankAccountId: entity.companyBankAccount.id,
    companyBankAccountName: entity.companyBankAccount.name,
    companyBankAccountNumber: entity.companyBankAccount.accountNumber,
    companyBankAccountCurrency: entity.companyBankAccount.currency,
    layoutId: entity.layout.id,
    layoutName: entity.layout.name,
    systemId: entity.layout.system?.id ?? 0,
    systemName: entity.layout.system?.name ?? entity.layout.systemLabel,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}

export function toPublicBankStatementDetail(entity: BankStatement): PublicBankStatementDetail {
  return {
    ...toPublicBankStatementSummary(entity),
    userBank: toPublicUserBankSummary(entity.userBank),
    companyBankAccount: toPublicCompanyBankAccountSummary(entity.companyBankAccount),
    layout: toPublicLayout(entity.layout, entity.userBank.id),
    rows: sortPreviewRows((entity.rows ?? []).map((row) => toPreviewRow(row)))
  };
}
