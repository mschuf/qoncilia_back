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
import { CompanyRoleModule } from "../access-control/entities/company-role-module.entity";
import { Company } from "../access-control/entities/company.entity";
import { UserRole } from "../access-control/entities/user-role.entity";
import { Role } from "../common/enums/role.enum";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { isGestorRole, isSuperAdminRole } from "../common/utils/role.util";
import {
  ensureStrongPassword,
  generateTemporaryPasswordFromOneToSix
} from "../common/utils/password.util";
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
    @InjectRepository(UserRole)
    private readonly roleRepository: Repository<UserRole>,
    @InjectRepository(CompanyRoleModule)
    private readonly companyRoleModuleRepository: Repository<CompanyRoleModule>,
    configService: ConfigService
  ) {
    this.bcryptRounds = Number(configService.get<string>("BCRYPT_ROUNDS", "12"));
  }

  async registerInactiveUser(payload: RegisterDto): Promise<PublicUser> {
    ensureStrongPassword(payload.password);

    const company = await this.resolveCompanyForRegistration(payload.companyId);
    const roleCode = this.resolveRoleCodeFromPayload(payload.roleCode, Role.GESTOR_PAGOS);

    if (!isGestorRole(roleCode)) {
      throw new ForbiddenException("El registro publico solo puede crear usuarios gestores.");
    }

    const role = await this.requireRoleByCode(roleCode);

    const user = this.userRepository.create({
      usrNombre: this.normalizeOptional(payload.usrNombre),
      usrApellido: this.normalizeOptional(payload.usrApellido),
      usrEmail: this.normalizeOptional(payload.usrEmail),
      usrCelular: this.normalizeOptional(payload.usrCelular),
      usrLogin: this.normalizeRequired(payload.usrLogin, "usrLogin"),
      usrLegajo: this.normalizeRequired(payload.usrLegajo, "usrLegajo"),
      passwordHash: await hash(payload.password, this.bcryptRounds),
      activo: false,
      company,
      role
    });

    try {
      const created = await this.userRepository.save(user);
      const hydrated = await this.requireUser(created.id);
      return this.toPublicUser(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async createFromAbm(payload: CreateUserDto, actor: AuthUser): Promise<PublicUser> {
    ensureStrongPassword(payload.password);

    const roleCode = this.resolveRoleCodeFromPayload(payload.roleCode, Role.GESTOR_COBRANZA);
    this.enforceActorCanAssignRole(actor, roleCode);

    const company = await this.resolveCompanyForAbm(actor, payload.companyId);
    const role = await this.requireRoleByCode(roleCode);

    const user = this.userRepository.create({
      usrNombre: this.normalizeOptional(payload.usrNombre),
      usrApellido: this.normalizeOptional(payload.usrApellido),
      usrEmail: this.normalizeOptional(payload.usrEmail),
      usrCelular: this.normalizeOptional(payload.usrCelular),
      usrLogin: this.normalizeRequired(payload.usrLogin, "usrLogin"),
      usrLegajo: this.normalizeRequired(payload.usrLegajo, "usrLegajo"),
      passwordHash: await hash(payload.password, this.bcryptRounds),
      activo: payload.activo ?? true,
      company,
      role
    });

    try {
      const created = await this.userRepository.save(user);
      const hydrated = await this.requireUser(created.id);
      return this.toPublicUser(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async listUsers(actor: AuthUser): Promise<PublicUser[]> {
    const where = isSuperAdminRole(actor.roleCode) ? {} : { company: { id: actor.companyId } };

    const users = await this.userRepository.find({
      where,
      relations: {
        company: true,
        role: true
      },
      order: { id: "ASC" }
    });

    return users.map((item) => this.toPublicUser(item));
  }

  async updateUser(id: number, payload: UpdateUserDto, actor: AuthUser): Promise<PublicUser> {
    const user = await this.requireUser(id);
    this.enforceActorCanManageTarget(actor, user);

    const currentRoleCode = this.resolveRoleCodeFromUser(user);
    const desiredRoleCode = this.resolveRoleCodeFromPayload(payload.roleCode, currentRoleCode);
    this.enforceActorCanAssignRole(actor, desiredRoleCode);

    const desiredCompany = await this.resolveCompanyForUpdate(actor, user, payload.companyId);
    const desiredRole = await this.requireRoleByCode(desiredRoleCode);

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
    if (payload.activo !== undefined) user.activo = payload.activo;

    user.company = desiredCompany;
    user.role = desiredRole;

    try {
      await this.userRepository.save(user);
      const updated = await this.requireUser(user.id);
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
        company: true,
        role: true
      }
    });
  }

  async findForAuth(identifier: string): Promise<User | null> {
    const normalizedIdentifier = identifier.trim().toLowerCase();

    return this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("user.role", "role")
      .where("LOWER(user.usr_login) = :identifier", { identifier: normalizedIdentifier })
      .orWhere("LOWER(user.usr_email) = :identifier", { identifier: normalizedIdentifier })
      .getOne();
  }

  async toPublicUserWithModules(user: User): Promise<PublicUser> {
    const hydrated = user.company && user.role ? user : await this.requireUser(user.id);
    const enabledModules = await this.resolveEnabledModules(hydrated.company.id, hydrated.role.id);
    return this.toPublicUser(hydrated, enabledModules);
  }

  toPublicUser(user: User, enabledModules: string[] = []): PublicUser {
    const roleCode = this.resolveRoleCodeFromUser(user);
    const roleName = user.role?.name ?? roleCode;

    if (!user.company) {
      throw new BadRequestException("Usuario sin empresa asociada.");
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
      roleId: user.role?.id ?? 0,
      roleCode,
      roleName,
      companyId: user.company.id,
      companyCode: user.company.code,
      companyName: user.company.name,
      enabledModules,
      role: roleCode
    };
  }

  private async requireUser(id: number): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    return user;
  }

  private async resolveEnabledModules(companyId: number, roleId: number): Promise<string[]> {
    const assignments = await this.companyRoleModuleRepository
      .createQueryBuilder("crm")
      .leftJoinAndSelect("crm.module", "module")
      .leftJoin("crm.company", "company")
      .leftJoin("crm.role", "role")
      .where("company.id = :companyId", { companyId })
      .andWhere("role.id = :roleId", { roleId })
      .andWhere("crm.enabled = :enabled", { enabled: true })
      .andWhere("module.active = :active", { active: true })
      .orderBy("module.code", "ASC")
      .getMany();

    return assignments.map((item) => item.module.code);
  }

  private async resolveCompanyForRegistration(companyId?: number): Promise<Company> {
    if (companyId) {
      return this.requireCompany(companyId);
    }

    const defaultByCode = await this.companyRepository.findOne({
      where: { code: "QONCILIA" }
    });

    if (defaultByCode) {
      return defaultByCode;
    }

    const firstCompany = await this.companyRepository.findOne({
      where: { active: true },
      order: { id: "ASC" }
    });

    if (!firstCompany) {
      throw new BadRequestException(
        "No hay empresas configuradas. Ejecuta el script 09_rbac_empresas_roles_modulos.sql."
      );
    }

    return firstCompany;
  }

  private async resolveCompanyForAbm(actor: AuthUser, payloadCompanyId?: number): Promise<Company> {
    if (isSuperAdminRole(actor.roleCode)) {
      if (!payloadCompanyId) {
        throw new BadRequestException("companyId es obligatorio para crear usuarios.");
      }

      return this.requireCompany(payloadCompanyId);
    }

    return this.requireCompany(actor.companyId);
  }

  private async resolveCompanyForUpdate(
    actor: AuthUser,
    targetUser: User,
    payloadCompanyId?: number
  ): Promise<Company> {
    if (isSuperAdminRole(actor.roleCode)) {
      if (!payloadCompanyId) return targetUser.company;
      return this.requireCompany(payloadCompanyId);
    }

    if (payloadCompanyId && payloadCompanyId !== actor.companyId) {
      throw new ForbiddenException("No podes mover usuarios a otra empresa.");
    }

    if (targetUser.company.id !== actor.companyId) {
      throw new ForbiddenException("No podes administrar usuarios de otra empresa.");
    }

    return targetUser.company;
  }

  private async requireCompany(companyId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException("Empresa no encontrada.");
    }

    return company;
  }

  private async requireRoleByCode(roleCode: Role): Promise<UserRole> {
    const role = await this.roleRepository.findOne({
      where: { code: roleCode, active: true }
    });

    if (!role) {
      throw new NotFoundException("Rol no encontrado.");
    }

    return role;
  }

  private resolveRoleCodeFromUser(user: User): Role {
    const roleCode = user.role?.code as Role | undefined;
    if (roleCode && Object.values(Role).includes(roleCode)) {
      return roleCode;
    }

    throw new BadRequestException("Usuario sin rol valido asociado.");
  }

  private resolveRoleCodeFromPayload(explicitRoleCode: Role | undefined, fallbackRoleCode: Role): Role {
    if (!explicitRoleCode) {
      return fallbackRoleCode;
    }

    if (!Object.values(Role).includes(explicitRoleCode)) {
      throw new BadRequestException("roleCode invalido.");
    }

    return explicitRoleCode;
  }

  private enforceActorCanAssignRole(actor: AuthUser, targetRoleCode: Role) {
    if (isSuperAdminRole(actor.roleCode)) {
      return;
    }

    if (actor.roleCode === Role.ADMIN && isGestorRole(targetRoleCode)) {
      return;
    }

    throw new ForbiddenException("No tenes permisos para asignar ese rol.");
  }

  private enforceActorCanManageTarget(actor: AuthUser, target: User) {
    if (isSuperAdminRole(actor.roleCode)) {
      return;
    }

    if (actor.roleCode === Role.ADMIN) {
      const targetRole = this.resolveRoleCodeFromUser(target);
      if (target.company.id === actor.companyId && isGestorRole(targetRole)) {
        return;
      }
    }

    throw new ForbiddenException("No tenes permisos para administrar este usuario.");
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

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & { driverError?: { code?: string; detail?: string } })
        .driverError;

      if (driverError?.code === "23505") {
        const detail = String(driverError.detail ?? "").toLowerCase();

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

      if (driverError?.code === "23503") {
        const detail = String(driverError.detail ?? "").toLowerCase();
        if (detail.includes("emp_id")) {
          throw new BadRequestException("La empresa asignada no existe.");
        }
        if (detail.includes("rol_id")) {
          throw new BadRequestException("El rol asignado no existe.");
        }
      }
    }

    throw error;
  }
}
