import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_MODULE_KEY } from "../decorators/required-module.decorator";
import { AppModuleCode } from "../enums/app-module-code.enum";
import { AuthUser } from "../interfaces/auth-user.interface";

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModules = this.reflector.getAllAndOverride<AppModuleCode[] | undefined>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;

    if (!user) {
      throw new ForbiddenException("Usuario no autenticado.");
    }

    const enabledModules = Array.isArray(user.enabledModules) ? user.enabledModules : [];
    if (!requiredModules.some((moduleCode) => enabledModules.includes(moduleCode))) {
      throw new ForbiddenException("No tenes habilitado este modulo.");
    }

    return true;
  }
}
