import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { RegisterDto } from "./register.dto";

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

export class CreateUserDto extends RegisterDto {
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}

