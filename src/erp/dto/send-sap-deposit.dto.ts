import { Type } from "class-transformer"
import { IsInt, IsObject, Min } from "class-validator"

export class SendSapDepositDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reconciliationId!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @IsObject()
  payload!: Record<string, unknown>
}
