import { Type } from "class-transformer"
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator"

export class SapLoginDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @IsOptional()
  @IsString()
  @MaxLength(160)
  username?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string
}
