import { Transform } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsPositive } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class ListReconciliationsQueryDto {
  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  userId?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  userBankId?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  companyBankAccountId?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  layoutId?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
