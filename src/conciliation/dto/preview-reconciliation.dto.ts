import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsPositive } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class PreviewReconciliationDto {
  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  reconciliationId?: number;

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

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  userId?: number;
}
