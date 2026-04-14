import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

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

export class UpdateCompanyDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nombre?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ruc?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
