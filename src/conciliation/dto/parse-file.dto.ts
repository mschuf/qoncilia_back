import { IsIn, IsInt, IsPositive, IsString } from "class-validator";

export class ParseFileDto {
  @IsInt()
  @IsPositive()
  userBankId!: number;

  @IsInt()
  @IsPositive()
  layoutId!: number;

  @IsString()
  @IsIn(["system", "bank"])
  source!: "system" | "bank";
}
