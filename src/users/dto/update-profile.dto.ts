import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from "class-validator";

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

export class UpdateProfileDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(80)
  usrLogin?: string;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  usrFoto?: string | null;
}
