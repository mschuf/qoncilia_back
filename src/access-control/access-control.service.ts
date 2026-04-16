import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, QueryFailedError, Repository } from "typeorm";
import { Role } from "../common/enums/role.enum";
import { isSuperAdminRole } from "../common/utils/role.util";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyRoleModulesDto } from "./dto/update-company-role-modules.dto";
import { AppModuleEntity } from "./entities/app-module.entity";
import { CompanyRoleModule } from "./entities/company-role-module.entity";
import { Company } from "./entities/company.entity";
import { UserRole } from "./entities/user-role.entity";
import {
  AccessControlReferenceResponse,
  CompanyRoleMatrixResponse,
  PublicAppModule,
  PublicCompany,
  PublicRole
} from "./interfaces/access-control.interfaces";

@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(UserRole)
    private readonly roleRepository: Repository<UserRole>,
    @InjectRepository(AppModuleEntity)
    private readonly moduleRepository: Repository<AppModuleEntity>,
    @InjectRepository(CompanyRoleModule)
    private readonly companyRoleModuleRepository: Repository<CompanyRoleModule>
  ) {}

  async listReference(actor: AuthUser): Promise<AccessControlReferenceResponse> {
    const [companies, roles, modules] = await Promise.all([
      this.listCompaniesForActor(actor),
      this.listRolesForActor(actor),
      this.listModules()
    ]);

    return {
      companies: companies.map((item) => this.toPublicCompany(item)),
      roles: roles.map((item) => this.toPublicRole(item)),
      modules: modules.map((item) => this.toPublicAppModule(item))
    };
  }

  async createCompany(payload: CreateCompanyDto, actor: AuthUser): Promise<PublicCompany> {
    this.ensureSuperadmin(actor);

    const company = this.companyRepository.create({
      code: this.normalizeCompanyCode(payload.code),
      name: this.normalizeRequired(payload.name, "name"),
      active: payload.active ?? true
    });

    try {
      const created = await this.companyRepository.save(company);
      return this.toPublicCompany(created);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async getCompanyRoleMatrix(
    companyId: number,
    actor: AuthUser
  ): Promise<CompanyRoleMatrixResponse> {
    this.ensureSuperadmin(actor);

    const company = await this.requireCompany(companyId);
    const [roles, modules, assignments] = await Promise.all([
      this.roleRepository.find({
        where: { active: true },
        order: { id: "ASC" }
      }),
      this.moduleRepository.find({
        where: { active: true },
        order: { id: "ASC" }
      }),
      this.companyRoleModuleRepository.find({
        where: {
          company: { id: companyId }
        },
        relations: {
          role: true,
          module: true
        }
      })
    ]);

    const assignmentMap = new Map<string, boolean>();
    for (const assignment of assignments) {
      assignmentMap.set(this.buildMapKey(assignment.role.id, assignment.module.id), assignment.enabled);
    }

    return {
      company: this.toPublicCompany(company),
      modules: modules.map((item) => this.toPublicAppModule(item)),
      rows: roles.map((role) => ({
        role: this.toPublicRole(role),
        modules: modules.map((module) => ({
          moduleId: module.id,
          moduleCode: module.code,
          enabled: assignmentMap.get(this.buildMapKey(role.id, module.id)) ?? false
        }))
      }))
    };
  }

  async updateCompanyRoleModules(
    companyId: number,
    roleId: number,
    payload: UpdateCompanyRoleModulesDto,
    actor: AuthUser
  ): Promise<CompanyRoleMatrixResponse> {
    this.ensureSuperadmin(actor);

    const company = await this.requireCompany(companyId);
    const role = await this.requireRole(roleId);

    const dedupedStates = new Map<number, boolean>();
    for (const moduleState of payload.moduleStates) {
      dedupedStates.set(moduleState.moduleId, moduleState.enabled);
    }

    const moduleIds = [...dedupedStates.keys()];
    if (moduleIds.length === 0) {
      throw new BadRequestException("Debes enviar al menos un modulo.");
    }

    const modules = await this.moduleRepository.find({
      where: { id: In(moduleIds) }
    });
    if (modules.length !== moduleIds.length) {
      throw new NotFoundException("Uno o mas modulos no existen.");
    }

    const existingAssignments = await this.companyRoleModuleRepository.find({
      where: {
        company: { id: company.id },
        role: { id: role.id }
      },
      relations: {
        module: true
      }
    });

    const assignmentByModuleId = new Map<number, CompanyRoleModule>();
    for (const assignment of existingAssignments) {
      assignmentByModuleId.set(assignment.module.id, assignment);
    }

    const toPersist: CompanyRoleModule[] = [];
    for (const moduleEntity of modules) {
      const existing = assignmentByModuleId.get(moduleEntity.id);
      const enabled = dedupedStates.get(moduleEntity.id) ?? false;

      if (existing) {
        existing.enabled = enabled;
        toPersist.push(existing);
      } else {
        toPersist.push(
          this.companyRoleModuleRepository.create({
            company,
            role,
            module: moduleEntity,
            enabled
          })
        );
      }
    }

    await this.companyRoleModuleRepository.save(toPersist);

    return this.getCompanyRoleMatrix(companyId, actor);
  }

  async getEnabledModuleCodes(companyId: number, roleId: number): Promise<string[]> {
    const assignments = await this.companyRoleModuleRepository.find({
      where: {
        company: { id: companyId },
        role: { id: roleId },
        enabled: true,
        module: { active: true }
      },
      relations: {
        module: true
      }
    });

    return assignments
      .map((item) => item.module.code)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listCompaniesForActor(actor: AuthUser): Promise<Company[]> {
    if (isSuperAdminRole(actor.roleCode)) {
      return this.companyRepository.find({
        order: { name: "ASC", id: "ASC" }
      });
    }

    const company = await this.companyRepository.findOne({
      where: { id: actor.companyId }
    });

    return company ? [company] : [];
  }

  private async listRolesForActor(actor: AuthUser): Promise<UserRole[]> {
    if (isSuperAdminRole(actor.roleCode)) {
      return this.roleRepository.find({
        where: { active: true },
        order: { id: "ASC" }
      });
    }

    return this.roleRepository.find({
      where: [
        { code: Role.GESTOR_COBRANZA, active: true },
        { code: Role.GESTOR_PAGOS, active: true }
      ],
      order: { id: "ASC" }
    });
  }

  private async listModules(): Promise<AppModuleEntity[]> {
    return this.moduleRepository.find({
      where: { active: true },
      order: { id: "ASC" }
    });
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

  private async requireRole(roleId: number): Promise<UserRole> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId }
    });

    if (!role) {
      throw new NotFoundException("Rol no encontrado.");
    }

    return role;
  }

  private ensureSuperadmin(actor: AuthUser) {
    if (!isSuperAdminRole(actor.roleCode)) {
      throw new ForbiddenException("Solo el super admin puede administrar empresas y modulos.");
    }
  }

  private toPublicCompany(entity: Company): PublicCompany {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      active: entity.active
    };
  }

  private toPublicRole(entity: UserRole): PublicRole {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      description: entity.description,
      active: entity.active
    };
  }

  private toPublicAppModule(entity: AppModuleEntity): PublicAppModule {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      routePath: entity.routePath,
      description: entity.description,
      active: entity.active
    };
  }

  private normalizeRequired(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${field} es obligatorio.`);
    }

    return trimmed;
  }

  private normalizeCompanyCode(value: string): string {
    return this.normalizeRequired(value, "code").toUpperCase().replace(/\s+/g, "_");
  }

  private buildMapKey(roleId: number, moduleId: number): string {
    return `${roleId}:${moduleId}`;
  }

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & { driverError?: { code?: string; detail?: string } })
        .driverError;

      if (driverError?.code === "23505") {
        const detail = String(driverError.detail ?? "").toLowerCase();
        if (detail.includes("emp_codigo")) {
          throw new ConflictException("Ya existe una empresa con ese codigo.");
        }

        throw new ConflictException("Ya existe un registro con esos datos unicos.");
      }
    }

    throw error;
  }
}
