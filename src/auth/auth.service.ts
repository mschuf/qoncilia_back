import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { RegisterDto } from "../users/dto/register.dto";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./interfaces/jwt-payload.interface";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(payload: RegisterDto) {
    const user = await this.usersService.registerInactiveUser(payload);
    return {
      message: "Usuario registrado. Queda inactivo hasta aprobación de admin/superadmin.",
      user
    };
  }

  async login(payload: LoginDto) {
    const user = await this.usersService.findForAuth(payload.identifier);
    if (!user) {
      throw new UnauthorizedException("Credenciales invalidas.");
    }

    if (!user.activo) {
      throw new UnauthorizedException({
        code: "USER_INACTIVE",
        message: "Usuario inactivo. Contacta a un administrador."
      });
    }

    const passwordValid = await compare(payload.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException("Credenciales invalidas.");
    }

    const publicUser = this.usersService.toPublicUser(user);
    const jwtPayload: JwtPayload = {
      sub: user.id,
      role: publicUser.role
    };

    const accessToken = await this.jwtService.signAsync(jwtPayload);
    const expiresInRaw = this.configService.get<string>("JWT_EXPIRES_IN", "1h");
    const expiresIn = this.parseExpiresIn(expiresInRaw);

    return {
      accessToken,
      expiresIn,
      user: publicUser
    };
  }

  private parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900;

    const num = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s": return num;
      case "m": return num * 60;
      case "h": return num * 3600;
      case "d": return num * 86400;
      default: return 900;
    }
  }

  async me(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado.");
    }

    if (!user.activo) {
      throw new UnauthorizedException({
        code: "USER_INACTIVE",
        message: "Usuario inactivo."
      });
    }

    return this.usersService.toPublicUser(user);
  }
}

