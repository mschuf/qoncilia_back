import { Type } from "class-transformer"
import {
  IsArray,
  IsIn,
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

  // Modo de match de la columna de referencia. "exact" (default) mantiene el
  // comportamiento SAP_B1; "like" (SAP_TARJETAS) hace match por contencion para
  // tolerar padding (p.ej. Cod. autorizacion "000000000159514" vs VoucherNum "159514").
  @IsOptional()
  @IsIn(["exact", "like"])
  referenceMatchMode?: "exact" | "like"
}
