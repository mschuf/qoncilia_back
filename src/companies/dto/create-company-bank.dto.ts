import { Transform } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

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

export class CreateCompanyBankDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  bancoNombre!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(40)
  tipoCuenta!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  moneda!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  numeroCuenta!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  titular?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sucursal?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
