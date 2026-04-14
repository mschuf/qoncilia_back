import { Transform } from "class-transformer";
import {
  IsInt,
  IsEmail,
  IsNotEmpty,
  IsPositive,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

export class RegisterDto {
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

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  usrLegajo!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      "La contraseña debe tener mínimo 6 caracteres, mayúscula, minúscula, número y símbolo."
  })
  password!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? Number(value) : value
  )
  @IsInt()
  @IsPositive()
  empresaId!: number;
}
