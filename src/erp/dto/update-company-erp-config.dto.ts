import { PartialType } from "@nestjs/mapped-types"
import { CreateCompanyErpConfigDto } from "./create-company-erp-config.dto"

export class UpdateCompanyErpConfigDto extends PartialType(CreateCompanyErpConfigDto) {}
