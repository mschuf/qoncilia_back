import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min
} from "class-validator";

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

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export class LayoutMappingDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  fieldKey!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  label!: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsIn(["equals", "contains", "starts_with", "ends_with", "numeric_equals", "date_equals"])
  compareOperator?: string;

  @Transform(toNumber)
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsNumber()
  @Min(0)
  tolerance?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  systemSheet?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{1,4}(\|[A-Za-z]{1,4})*$/)
  systemColumn?: string;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  systemStartRow?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  systemEndRow?: number;

  @IsOptional()
  @IsIn(["text", "number", "amount", "date"])
  systemDataType?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankSheet?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{1,4}(\|[A-Za-z]{1,4})*$/)
  bankColumn?: string;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  bankStartRow?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @IsPositive()
  bankEndRow?: number;

  @IsOptional()
  @IsIn(["text", "number", "amount", "date"])
  bankDataType?: string;
}
