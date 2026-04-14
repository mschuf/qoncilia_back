import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from "class-validator";
import { Transform } from "class-transformer";
import { CreateCompanyBankDto } from "./create-company-bank.dto";

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

export class CreateCompanyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  nombre!: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCompanyBankDto)
  bancos?: CreateCompanyBankDto[];
}
