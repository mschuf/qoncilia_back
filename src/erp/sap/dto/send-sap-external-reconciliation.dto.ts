import { Transform, Type } from "class-transformer"
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator"

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }

  return value
}

export const sapExternalReconciliationAccountTypes = [
  "rat_GLAccount",
  "rat_BusinessPartner"
] as const

export type SapExternalReconciliationAccountType =
  (typeof sapExternalReconciliationAccountTypes)[number]

export class SapExternalReconciliationJournalEntryLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transactionNumber!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  lineNumber!: number
}

export class SapExternalReconciliationBankStatementLineDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankStatementAccountCode?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankStatementLineSequence?: number
}

export class SapExternalReconciliationMatchDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  systemRowId?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankRowId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankStatementRowId?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transactionNumber?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lineNumber?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankStatementLineSequence?: number

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankStatementAccountCode?: string
}

export class SendSapExternalReconciliationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reconciliationId?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankStatementId?: number

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountCode?: string

  @IsOptional()
  @IsIn(sapExternalReconciliationAccountTypes)
  reconciliationAccountType?: SapExternalReconciliationAccountType

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapExternalReconciliationMatchDto)
  matches?: SapExternalReconciliationMatchDto[]

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapExternalReconciliationBankStatementLineDto)
  bankStatementLines?: SapExternalReconciliationBankStatementLineDto[]

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapExternalReconciliationJournalEntryLineDto)
  journalEntryLines?: SapExternalReconciliationJournalEntryLineDto[]

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>
}
