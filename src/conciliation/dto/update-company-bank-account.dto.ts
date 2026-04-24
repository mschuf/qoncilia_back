import { PartialType } from "@nestjs/mapped-types";
import { CreateCompanyBankAccountDto } from "./create-company-bank-account.dto";

export class UpdateCompanyBankAccountDto extends PartialType(CreateCompanyBankAccountDto) {}
