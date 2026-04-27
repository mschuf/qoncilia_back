import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
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

export class ApplyTemplateLayoutDto {
  @Transform(toNumber)
  @IsOptional()
  @IsNumber()
  @Min(1)
  systemId?: number;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  systemLabel?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankLabel?: string;

  @Transform(toNumber)
  @IsOptional()
  @IsNumber()
  @Min(0)
  autoMatchThreshold?: number;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
