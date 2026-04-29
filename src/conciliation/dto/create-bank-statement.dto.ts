import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
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
