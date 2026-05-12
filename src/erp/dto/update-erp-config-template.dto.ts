import { PartialType } from "@nestjs/mapped-types"
import { CreateErpConfigTemplateDto } from "./create-erp-config-template.dto"

export class UpdateErpConfigTemplateDto extends PartialType(CreateErpConfigTemplateDto) {}
