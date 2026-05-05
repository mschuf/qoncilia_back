import { Transform, Type } from "class-transformer"
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
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

export class SapCreditDepositLineDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  absId?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankStatementRowId?: number

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
  creditCard?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentMethodCode?: number

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  voucherNumber?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ref3?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString()
  payDate?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customer?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  creditCurrency?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string
}

export class SendSapDepositDto {
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
  @IsDateString()
  depositDate?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  depositCurrency?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankReference?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  journalRemarks?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultCustomer?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditCard?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentMethodCode?: number

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapCreditDepositLineDto)
  creditLines?: SapCreditDepositLineDto[]

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>
}
