import { SetMetadata } from "@nestjs/common";
import { AppModuleCode } from "../enums/app-module-code.enum";

export const REQUIRED_MODULE_KEY = "required_module";
export const RequiredModule = (moduleCode: AppModuleCode) =>
  SetMetadata(REQUIRED_MODULE_KEY, moduleCode);
