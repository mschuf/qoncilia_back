import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsPositive } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class ConciliationKpiQueryDto {
  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  userId?: number;
}
