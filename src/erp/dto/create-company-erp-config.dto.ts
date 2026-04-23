import { Transform } from "class-transformer"
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min
} from "class-validator"
import { ErpType } from "../../common/enums/erp-type.enum"

export class CreateCompanyErpConfigDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  companyId!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  code!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string

  @IsOptional()
  @IsString()
  @IsIn(Object.values(ErpType))
  erpType?: ErpType

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  sapUsername!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  dbName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  cmpName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  serverNode!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  dbUser!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(255)
  serviceLayerUrl!: string

  @IsString()
  @IsIn(["1.0", "1.1", "1.2", "1.3"])
  tlsVersion!: string

  @IsOptional()
  @IsBoolean()
  allowSelfSigned?: boolean

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>
}
