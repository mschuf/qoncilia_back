import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: { name?: string; message?: string } | undefined,
    _context: ExecutionContext,
    _status?: unknown
  ): TUser {
    if (info?.name === "TokenExpiredError") {
      throw new UnauthorizedException({
        code: "TOKEN_EXPIRED",
        message: "El token expiró. Iniciá sesión nuevamente."
      });
    }

    if (err || !user) {
      throw err ?? new UnauthorizedException({ code: "UNAUTHORIZED", message: "No autorizado." });
    }

    return user;
  }

  getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }
}
