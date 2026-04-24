import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class ListCompanyBankingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;
}
