import { Transform } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

export class CreateConciliationSystemDto {
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
