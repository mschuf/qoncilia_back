import { Transform, Type } from "class-transformer"
import { IsNumber, IsString, MaxLength, Min } from "class-validator"
import { SendSapTarjetasDepositDto } from "./send-sap-tarjetas-deposit.dto"

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value

// Deposito UENO de OCHO_A: un lote por Tipo de tarjeta + Fecha de Acreditacion
// + Nro. de comprobante de pago. bankReference lleva el comprobante (REF) y
// depositDate la Fecha de Acreditacion. Comision = Monto bruto - Monto neto.
export class SendOchoAUenoDepositDto extends SendSapTarjetasDepositDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  uenoCardType!: string

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  uenoGrossAmount!: number

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  uenoNetAmount!: number
}
