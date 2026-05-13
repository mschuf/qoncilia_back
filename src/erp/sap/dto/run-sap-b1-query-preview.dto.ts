import { Type } from "class-transformer"
import { IsDateString, IsInt, Min } from "class-validator"

export class RunSapB1QueryPreviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyBankAccountId!: number

  @IsDateString()
  dateFrom!: string

  @IsDateString()
  dateTo!: string
}
