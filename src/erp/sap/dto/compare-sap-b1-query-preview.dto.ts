import { Type } from "class-transformer"
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator"

export class SapB1QueryTableDto {
  @IsArray()
  @IsString({ each: true })
  columns!: string[]

  @IsArray()
  @IsObject({ each: true })
  rows!: Record<string, unknown>[]
}

export class CompareSapB1QueryPreviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number

  @ValidateNested()
  @Type(() => SapB1QueryTableDto)
  bank!: SapB1QueryTableDto

  @ValidateNested()
  @Type(() => SapB1QueryTableDto)
  system!: SapB1QueryTableDto

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedBankRowIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedSystemRowIds?: string[]
}
