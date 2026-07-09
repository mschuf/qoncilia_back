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

  // Comentario del asiento (cabecera JournalRemarks). Si viene vacio, el backend
  // aplica el default "COMPRA P.O.S BANCARD".
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  journalRemarks?: string

  // "Cuenta Pago ERP" de la cuenta bancaria (cabecera BankAccountNum).
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNum?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapTarjetasDepositCreditLineDto)
  creditLines!: SapTarjetasDepositCreditLineDto[]
}
