import { SetMetadata } from "@nestjs/common";
import { AppModuleCode } from "../enums/app-module-code.enum";

export const REQUIRED_MODULE_KEY = "required_module";
// Acepta varios modulos: el usuario necesita tener habilitado AL MENOS UNO.
export const RequiredModule = (...moduleCodes: AppModuleCode[]) =>
  SetMetadata(REQUIRED_MODULE_KEY, moduleCodes);
