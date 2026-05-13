import { Transform } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength
} from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

const toStringArray = ({ value }: { value: unknown }) => {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

class BankStatementSelectionDto {
  @Transform(toNumber)
  @IsInt()
  @IsPositive()
  userBankId!: number;

  @Transform(toNumber)
  @IsInt()
  @IsPositive()
  companyBankAccountId!: number;

  @Transform(toNumber)
  @IsInt()
  @IsPositive()
  layoutId!: number;

  @Transform(toStringArray)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedRowIds?: string[];
}

export class CreateBankStatementDto extends BankStatementSelectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
}

export class PreviewBankStatementDto extends BankStatementSelectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}
