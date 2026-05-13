import { Transform } from "class-transformer"
import {
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsArray,
  IsString,
  IsUrl,
  MaxLength,
  Min
} from "class-validator"

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }

  return value
}

const toOptionalNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === "") return undefined
  return Number(value)
}

const toNumberArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === "") return undefined
  const values = Array.isArray(value) ? value : [value]
  return values
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

export class CreateCompanyErpConfigDto {
  @Transform(toOptionalNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number

  @Transform(toNumberArray)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  companyIds?: number[]

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
  @MaxLength(100)
  serverNode?: string

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  queryBanco?: string

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  querySistema?: string

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
