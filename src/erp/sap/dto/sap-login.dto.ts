import { Type } from "class-transformer"
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator"

export class SapLoginDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  username!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string
}
