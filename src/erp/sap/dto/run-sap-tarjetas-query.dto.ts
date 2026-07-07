import { Type } from "class-transformer"
import { IsDateString, IsInt, IsOptional, Min } from "class-validator"

// Ejecuta SOLO el query del sistema (OCRH / depositos de tarjeta de credito) para
// el modo SAP_TARJETAS. No requiere cuenta bancaria: si se envia, su cuenta mayor
// se enlaza como $1; si no, el query simplemente no debe usar $1.
export class RunSapTarjetasQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  companyBankAccountId?: number

  @IsDateString()
  dateFrom!: string

  @IsDateString()
  dateTo!: string
}
