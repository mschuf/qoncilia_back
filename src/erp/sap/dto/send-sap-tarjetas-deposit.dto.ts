import { Transform, Type } from "class-transformer"
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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

  // Fecha del deposito (cabecera DepositDate). Obligatoria; el front manda
  // YYYY-MM-DD y el backend la envia al Service Layer como medianoche UTC.
  @Transform(trimString)
  @IsDateString()
  depositDate!: string

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

  // Descripcion del banco (cabecera Bank).
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bank?: string

  // Sucursal de la cuenta bancaria (cabecera BankBranch).
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankBranch?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SapTarjetasDepositCreditLineDto)
  creditLines!: SapTarjetasDepositCreditLineDto[]
}
