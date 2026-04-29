import { Transform } from "class-transformer";
import {
  IsEnum,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { Role } from "../../common/enums/role.enum";

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const toInteger = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

export class RegisterDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  usrNombre?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  usrApellido?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  usrEmail?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: "El celular debe estar en formato internacional (ej: +595981123456)."
  })
  usrCelular?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  usrLogin!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  usrLegajo?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @Transform(toInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(Role)
  roleCode?: Role;
}
