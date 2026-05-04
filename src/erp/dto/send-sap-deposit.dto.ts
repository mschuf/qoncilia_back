import { Type } from "class-transformer"
import { IsInt, IsObject, IsOptional, Min } from "class-validator"

export class SendSapDepositDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reconciliationId?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @IsObject()
  payload!: Record<string, unknown>
}
