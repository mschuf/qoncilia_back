import { Type } from "class-transformer"
import { IsInt, Min } from "class-validator"

export class SapSessionStatusQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number
}
