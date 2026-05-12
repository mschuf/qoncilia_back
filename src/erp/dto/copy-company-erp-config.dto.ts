import { Transform } from "class-transformer"
import { ArrayMinSize, IsArray, IsInt, Min } from "class-validator"

const toNumberArray = ({ value }: { value: unknown }) => {
  const values = Array.isArray(value) ? value : [value]
  return values
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

export class CopyCompanyErpConfigDto {
  @Transform(toNumberArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  companyIds!: number[]
}
