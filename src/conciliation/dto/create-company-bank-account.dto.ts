import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
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

  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  accountNumber!: string;

  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  bankErpId!: string;

  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  majorAccountNumber!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentAccountNumber?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
