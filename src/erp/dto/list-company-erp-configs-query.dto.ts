import { Transform, Type } from "class-transformer"
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator"

export class ListCompanyErpConfigsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  activeOnly?: boolean
}
