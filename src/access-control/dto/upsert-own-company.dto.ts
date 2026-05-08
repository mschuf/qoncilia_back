import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

export class UpsertOwnCompanyDto {
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fiscalId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  logo?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  webserviceErp?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  schemeErp?: string;
}
