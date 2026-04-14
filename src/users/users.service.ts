import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { hash } from "bcryptjs";
import { QueryFailedError, Repository } from "typeorm";
import { Company } from "../companies/entities/company.entity";
import { Role } from "../common/enums/role.enum";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import {
  ensureStrongPassword,
  generateTemporaryPasswordFromOneToSix
} from "../common/utils/password.util";
import { resolveRoleFromFlags } from "../common/utils/role.util";
import { CreateUserDto } from "./dto/create-user.dto";
import { RegisterDto } from "./dto/register.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./entities/user.entity";
import { PublicUser } from "./interfaces/public-user.interface";

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    configService: ConfigService
  ) {
    this.bcryptRounds = Number(configService.get<string>("BCRYPT_ROUNDS", "12"));
  }

  async registerInactiveUser(payload: RegisterDto): Promise<PublicUser> {
    ensureStrongPassword(payload.password);
    const empresa = await this.requireActiveCompany(payload.empresaId);

    const user = this.userRepository.create({
      usrNombre: this.normalizeOptional(payload.usrNombre),
      usrApellido: this.normalizeOptional(payload.usrApellido),
      usrEmail: this.normalizeOptional(payload.usrEmail),
      usrCelular: this.normalizeOptional(payload.usrCelular),
      usrLogin: this.normalizeRequired(payload.usrLogin, "usrLogin"),
      usrLegajo: this.normalizeRequired(payload.usrLegajo, "usrLegajo"),
      passwordHash: await hash(payload.password, this.bcryptRounds),
      activo: false,
      isAdmin: false,
      isSuperAdmin: false,
      empresa
    });

    try {
      const created = await this.userRepository.save(user);
      const persisted = await this.requireUser(created.id);
      return this.toPublicUser(persisted);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async createFromAbm(payload: CreateUserDto, actor: AuthUser): Promise<PublicUser> {
    ensureStrongPassword(payload.password);

    const desiredFlags = this.normalizeRoleFlags({
      isAdmin: payload.isAdmin,
      isSuperAdmin: payload.isSuperAdmin
    });
    const empresa = await this.requireActiveCompany(payload.empresaId);

    this.enforceActorCanAssignRole(actor, desiredFlags);

    const user = this.userRepository.create({
      usrNombre: this.normalizeOptional(payload.usrNombre),
      usrApellido: this.normalizeOptional(payload.usrApellido),
      usrEmail: this.normalizeOptional(payload.usrEmail),
      usrCelular: this.normalizeOptional(payload.usrCelular),
      usrLogin: this.normalizeRequired(payload.usrLogin, "usrLogin"),
      usrLegajo: this.normalizeRequired(payload.usrLegajo, "usrLegajo"),
      passwordHash: await hash(payload.password, this.bcryptRounds),
      activo: payload.activo ?? true,
      ...desiredFlags,
      empresa
    });

    try {
      const created = await this.userRepository.save(user);
      const persisted = await this.requireUser(created.id);
      return this.toPublicUser(persisted);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async listUsers(): Promise<PublicUser[]> {
    const users = await this.userRepository.find({
      relations: {
        empresa: true
      },
      order: { id: "ASC" }
    });

    return users.map((item) => this.toPublicUser(item));
  }

  async updateUser(id: number, payload: UpdateUserDto, actor: AuthUser): Promise<PublicUser> {
    const user = await this.requireUser(id);
    this.enforceActorCanManageTarget(actor, user);

    const resolvedFlags = this.normalizeRoleFlags({
      isAdmin: payload.isAdmin ?? user.isAdmin,
      isSuperAdmin: payload.isSuperAdmin ?? user.isSuperAdmin
    });

    this.enforceActorCanAssignRole(actor, resolvedFlags);

    if (payload.usrNombre !== undefined) user.usrNombre = this.normalizeOptional(payload.usrNombre);
    if (payload.usrApellido !== undefined) user.usrApellido = this.normalizeOptional(payload.usrApellido);
    if (payload.usrEmail !== undefined) user.usrEmail = this.normalizeOptional(payload.usrEmail);
    if (payload.usrCelular !== undefined) user.usrCelular = this.normalizeOptional(payload.usrCelular);
    if (payload.usrLogin !== undefined) {
      user.usrLogin = this.normalizeRequired(payload.usrLogin, "usrLogin");
    }
    if (payload.usrLegajo !== undefined) {
      user.usrLegajo = this.normalizeRequired(payload.usrLegajo, "usrLegajo");
    }
    if (payload.empresaId !== undefined) {
      user.empresa = await this.requireActiveCompany(payload.empresaId);
    }
    if (payload.activo !== undefined) user.activo = payload.activo;

    user.isAdmin = resolvedFlags.isAdmin;
    user.isSuperAdmin = resolvedFlags.isSuperAdmin;

    try {
      await this.userRepository.save(user);
      const updated = await this.requireUser(id);
      return this.toPublicUser(updated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async resetPassword(id: number, actor: AuthUser): Promise<{ temporaryPassword: string }> {
    const user = await this.requireUser(id);
    this.enforceActorCanManageTarget(actor, user);

    const temporaryPassword = generateTemporaryPasswordFromOneToSix(6);
    user.passwordHash = await hash(temporaryPassword, this.bcryptRounds);
    await this.userRepository.save(user);

    return { temporaryPassword };
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: {
        empresa: true
      }
    });
  }

  async findForAuth(identifier: string): Promise<User | null> {
    const normalizedIdentifier = identifier.trim().toLowerCase();

    return this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.empresa", "empresa")
      .where("LOWER(user.usr_login) = :identifier", { identifier: normalizedIdentifier })
      .orWhere("LOWER(user.usr_email) = :identifier", { identifier: normalizedIdentifier })
      .getOne();
  }

  toPublicUser(user: User): PublicUser {
    if (!user.empresa) {
      throw new BadRequestException("El usuario no tiene una empresa asignada.");
    }

    return {
      id: user.id,
      usrNombre: user.usrNombre,
      usrApellido: user.usrApellido,
      usrEmail: user.usrEmail,
      usrCelular: user.usrCelular,
      usrLogin: user.usrLogin,
      usrLegajo: user.usrLegajo,
      activo: user.activo,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
      role: resolveRoleFromFlags(user),
      empresa: {
        id: user.empresa.id,
        nombre: user.empresa.nombre,
        ruc: user.empresa.ruc
      }
    };
  }

  private async requireUser(id: number): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    return user;
  }

  private async requireActiveCompany(id: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id, activo: true }
    });

    if (!company) {
      throw new NotFoundException("Empresa no encontrada o inactiva.");
    }

    return company;
  }

  private normalizeOptional(value?: string): string | null {
    if (value === undefined) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeRequired(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${field} es obligatorio.`);
    }

    return trimmed;
  }

  private normalizeRoleFlags({
    isAdmin,
    isSuperAdmin
  }: {
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
  }): { isAdmin: boolean; isSuperAdmin: boolean } {
    const normalized = {
      isAdmin: Boolean(isAdmin),
      isSuperAdmin: Boolean(isSuperAdmin)
    };

    if (normalized.isSuperAdmin) {
      normalized.isAdmin = true;
    }

    return normalized;
  }

  private enforceActorCanAssignRole(
    actor: AuthUser,
    roleFlags: { isAdmin: boolean; isSuperAdmin: boolean }
  ) {
    if (actor.role === Role.SUPERADMIN) {
      return;
    }

    if (actor.role === Role.ADMIN && !roleFlags.isAdmin && !roleFlags.isSuperAdmin) {
      return;
    }

    throw new ForbiddenException("No tenes permisos para asignar ese rol.");
  }

  private enforceActorCanManageTarget(actor: AuthUser, target: User) {
    if (actor.role === Role.SUPERADMIN) {
      return;
    }

    if (actor.role === Role.ADMIN) {
      const targetRole = resolveRoleFromFlags(target);
      if (targetRole === Role.GESTOR) {
        return;
      }
    }

    throw new ForbiddenException("No tenes permisos para administrar este usuario.");
  }

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & { driverError?: { code?: string; detail?: string } })
        .driverError;
      const code = driverError?.code;
      const detail = String(driverError?.detail ?? "").toLowerCase();

      if (code === "23505") {
        if (detail.includes("usr_email")) {
          throw new ConflictException("El email ya existe.");
        }
        if (detail.includes("usr_celular")) {
          throw new ConflictException("El celular ya existe.");
        }
        if (detail.includes("usr_login")) {
          throw new ConflictException("El login ya existe.");
        }
        if (detail.includes("usr_legajo")) {
          throw new ConflictException("El legajo ya existe.");
        }

        throw new ConflictException("Ya existe un usuario con esos datos unicos.");
      }

      if (code === "23503" && detail.includes("emp_id")) {
        throw new BadRequestException("Empresa invalida.");
      }
    }

    throw error;
  }
}
