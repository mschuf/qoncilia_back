import { PartialType } from "@nestjs/mapped-types";
import { CreateConciliationSystemDto } from "./create-conciliation-system.dto";

export class UpdateConciliationSystemDto extends PartialType(CreateConciliationSystemDto) {}
