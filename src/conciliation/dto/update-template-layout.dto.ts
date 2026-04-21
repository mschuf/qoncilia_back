import { PartialType } from "@nestjs/mapped-types";
import { CreateTemplateLayoutDto } from "./create-template-layout.dto";

export class UpdateTemplateLayoutDto extends PartialType(CreateTemplateLayoutDto) {}
