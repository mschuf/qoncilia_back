import { Transform, Type } from "class-transformer"
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator"

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value

export class SapTarjetasDepositCreditLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  absId!: number
}

export class SendSapTarjetasDepositDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  depositAccount!: string

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  voucherAccount?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapTarjetasDepositCreditLineDto)
  creditLines!: SapTarjetasDepositCreditLineDto[]
}
