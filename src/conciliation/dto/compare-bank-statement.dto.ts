import { Transform } from "class-transformer";
import { IsInt, IsPositive } from "class-validator";

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class CompareBankStatementDto {
  @Transform(toNumber)
  @IsInt()
  @IsPositive()
  bankStatementId!: number;
}
