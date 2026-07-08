import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

export class CreateCompanyBankAccountDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankId!: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  currency!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  accountNumber!: string;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankErpId?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  majorAccountNumber!: string;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentAccountNumber?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
