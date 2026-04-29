import { Transform } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class ListBankStatementsQueryDto {
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

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  page?: number = 1;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}
