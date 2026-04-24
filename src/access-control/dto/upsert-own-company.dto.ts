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
}
