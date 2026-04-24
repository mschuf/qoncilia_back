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

  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  alias?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
