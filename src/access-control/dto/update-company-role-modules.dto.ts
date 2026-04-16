import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  ValidateNested
} from "class-validator";

const toInteger = ({ value }: { value: unknown }) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

export class ModuleStateDto {
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  moduleId!: number;

  @Transform(toBoolean)
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateCompanyRoleModulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ModuleStateDto)
  moduleStates!: ModuleStateDto[];
}
