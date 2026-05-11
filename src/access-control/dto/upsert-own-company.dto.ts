import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

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

export class UpsertOwnCompanyDto {
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fiscalId?: string;

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
}
