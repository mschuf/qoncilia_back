import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested
} from "class-validator";

class SavePreviewRowDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  rowId!: string;

  @IsInt()
  @IsPositive()
  rowNumber!: number;

  @IsObject()
  values!: Record<string, string | null>;

  @IsObject()
  normalized!: Record<string, string | number | null>;
}

class SavePreviewMatchRuleDto {
  @IsString()
  fieldKey!: string;

  @IsString()
  label!: string;

  @IsBoolean()
  passed!: boolean;

  @IsString()
  compareOperator!: string;

  @IsOptional()
  systemValue?: string | number | null;

  @IsOptional()
  bankValue?: string | number | null;
}

class SavePreviewMatchDto {
  @IsString()
  systemRowId!: string;

  @IsString()
  bankRowId!: string;

  @IsInt()
  @IsPositive()
  systemRowNumber!: number;

  @IsInt()
  @IsPositive()
  bankRowNumber!: number;

  @IsNumber()
  score!: number;

  @IsIn(["auto", "manual"])
  status!: "auto" | "manual";

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePreviewMatchRuleDto)
  ruleResults!: SavePreviewMatchRuleDto[];
}

export class SaveReconciliationDto {
  @IsInt()
  @IsPositive()
  userBankId!: number;

  @IsInt()
  @IsPositive()
  layoutId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  systemFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankFileName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePreviewRowDto)
  systemRows!: SavePreviewRowDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePreviewRowDto)
  bankRows!: SavePreviewRowDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePreviewMatchDto)
  autoMatches!: SavePreviewMatchDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePreviewMatchDto)
  manualMatches!: SavePreviewMatchDto[];
}
