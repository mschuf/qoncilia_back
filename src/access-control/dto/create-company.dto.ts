import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

export class CreateCompanyDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fiscalId?: string;

  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  webserviceErp?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  schemeErp?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  tlsVersionErp?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cardsId?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  logo?: string | null;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  validityDate?: string;
}
