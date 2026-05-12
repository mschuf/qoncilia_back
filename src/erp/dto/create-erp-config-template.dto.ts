import { Transform } from "class-transformer"
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength
} from "class-validator"

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }

  return value
}

export class CreateErpConfigTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  code!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(120)
  userSystem?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  userPass?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  dbName?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  serverNode?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  dbUser?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(255)
  serviceLayerUrl?: string

  @IsOptional()
  @IsString()
  @IsIn(["1.0", "1.1", "1.2", "1.3"])
  tlsVersion?: string

  @IsOptional()
  @IsBoolean()
  allowSelfSigned?: boolean

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>
}
