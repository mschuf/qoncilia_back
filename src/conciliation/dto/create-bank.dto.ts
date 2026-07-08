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

export class CreateBankDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
