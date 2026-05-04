import { Type } from "class-transformer"
import { IsInt, Min } from "class-validator"

export class SapLogoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number
}
