import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsPositive, IsString, Max } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class ListCompanyBankingQueryDto {
  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  companyId?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  bankId?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  page?: number = 1;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}
