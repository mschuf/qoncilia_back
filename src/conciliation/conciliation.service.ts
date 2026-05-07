import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  EntityManager,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder
} from "typeorm";
import { Role } from "../common/enums/role.enum";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { isGestorRole } from "../common/utils/role.util";
import { User } from "../users/entities/user.entity";
import { ApplyTemplateLayoutDto } from "./dto/apply-template-layout.dto";
import { AssignGestorBankDto } from "./dto/assign-gestor-bank.dto";
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto";
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto";
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateConciliationSystemDto } from "./dto/create-conciliation-system.dto";
import { CreateLayoutDto } from "./dto/create-layout.dto";
import { CreateTemplateLayoutDto } from "./dto/create-template-layout.dto";
import { CompanyBankAccount } from "./entities/company-bank-account.entity";
import { ConciliationSystem } from "./entities/conciliation-system.entity";
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto";
import { UpdateConciliationSystemDto } from "./dto/update-conciliation-system.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { UpdateLayoutDto } from "./dto/update-layout.dto";
import { UpdateTemplateLayoutDto } from "./dto/update-template-layout.dto";
import { BankEntity } from "./entities/bank.entity";
import { BankStatement } from "./entities/bank-statement.entity";
import { BankStatementRow } from "./entities/bank-statement-row.entity";
import { ReconciliationLayoutMapping } from "./entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "./entities/reconciliation-layout.entity";
import { TemplateLayoutMapping } from "./entities/template-layout-mapping.entity";
import { TemplateLayout } from "./entities/template-layout.entity";
import { SetBankAvailableTemplatesDto } from "./dto/set-bank-available-templates.dto";
import { UserTemplateAvailability } from "./entities/user-template-availability.entity";
import {
  BankStatementPreviewResponse,
  ConciliationKpiResponse,
  ConciliationPreviewResponse,
  DeleteUserBankResponse,
  PublicBankStatementDetail,
  PublicBankStatementSummary,
  PublicConciliationSystem,
  PublicBankWithAvailableTemplates,
  PublicGestorAssignmentCatalog,
  PublicLayout,
  SyncGestorBankAssignmentResponse,
  PublicTemplateLayout,
  PublicUserBankDeletionPreview,
  PublicUserBankWithLayouts,
  PaginatedResponse
} from "./interfaces/conciliation.interfaces";
import {
  ensureActorCanAccessCompany,
  ensureActorCanAccessTargetUser,
  ensureAdminOrSuperadmin,
  ensureSuperadmin
} from "./utils/conciliation-access.util";
import { handleConciliationDatabaseError } from "./utils/conciliation-error.util";
import {
  toPreviewRow,
  toPublicBankStatementDetail,
  toPublicBankStatementSummary,
  toPublicCompanyBankAccountSummary,
  toPublicLayout,
  toPublicSystem,
  toPublicTemplateLayout,
  toPublicUserBank,
  toPublicUserBankDeletionAccount,
  toPublicUserBankDeletionLayout,
  toPublicUserBankWithLayouts,
  toPublicUserBankSummary
} from "./utils/conciliation-mapper.util";
import {
  buildUserFullName,
  ensureMappings,
  formatTodayTag,
  normalizeColumn,
  normalizeOptional,
  normalizeRequired,
  normalizeThreshold,
  sortLayouts,
  sortMappings,
  sortTemplateMappings,
  toJsonRecord
} from "./utils/conciliation-value.util";
import { requireSystem } from "./utils/conciliation-repository.util";
import {
  buildAutoMatches,
  buildPreviewMetrics,
  extractRowsFromWorkbook,
  readWorkbook,
  sortPreviewRows
} from "./utils/conciliation-workbook.util";

type UploadedMemoryFile = {
  buffer: Buffer;
  originalname: string;
};

type AccessibleUserScope = {
  userId?: number;
  companyId?: number;
};

@Injectable()
export class ConciliationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BankEntity)
    private readonly userBankRepository: Repository<BankEntity>,
    @InjectRepository(CompanyBankAccount)
    private readonly companyBankAccountRepository: Repository<CompanyBankAccount>,
    @InjectRepository(BankStatement)
    private readonly bankStatementRepository: Repository<BankStatement>,
    @InjectRepository(BankStatementRow)
    private readonly bankStatementRowRepository: Repository<BankStatementRow>,
    @InjectRepository(ConciliationSystem)
    private readonly systemRepository: Repository<ConciliationSystem>,
    @InjectRepository(TemplateLayout)
    private readonly templateLayoutRepository: Repository<TemplateLayout>,
    @InjectRepository(TemplateLayoutMapping)
    private readonly templateLayoutMappingRepository: Repository<TemplateLayoutMapping>,
    @InjectRepository(UserTemplateAvailability)
    private readonly userTemplateAvailabilityRepository: Repository<UserTemplateAvailability>,
    @InjectRepository(ReconciliationLayout)
    private readonly layoutRepository: Repository<ReconciliationLayout>,
    @InjectRepository(ReconciliationLayoutMapping)
    private readonly layoutMappingRepository: Repository<ReconciliationLayoutMapping>
  ) {}

  async listCatalog(actor: AuthUser, requestedUserId?: number): Promise<PublicUserBankWithLayouts[]> {
    const scope = await this.resolveAccessibleConfigurationScope(actor, requestedUserId);
    const queryBuilder = this.userBankRepository
      .createQueryBuilder("userBank")
      .leftJoinAndSelect("userBank.company", "bankCompany")
      .leftJoinAndSelect("userBank.user", "user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("userBank.accounts", "account")
      .leftJoinAndSelect("userBank.layouts", "layout")
      .leftJoinAndSelect("layout.system", "system")
      .leftJoinAndSelect("layout.mappings", "mapping")
      .leftJoinAndSelect("layout.templateLayout", "templateLayout");

    this.applyUserScopeToQuery(queryBuilder, scope, "user", "bankCompany");
    queryBuilder.andWhere("userBank.banco_origen_id IS NULL");

    const banks = await queryBuilder.getMany();

    const availabilityByUser = await this.loadAvailabilityByUser(
      banks.map((bank) => bank.user.id)
    );

    return banks
      .sort((left, right) => {
        const byUser = left.user.usrLogin.localeCompare(right.user.usrLogin);
        if (byUser !== 0) return byUser;
        const byBank = left.bankName.localeCompare(right.bankName);
        if (byBank !== 0) return byBank;
        return left.id - right.id;
      })
      .map((bank) =>
        toPublicUserBankWithLayouts(bank, availabilityByUser.get(bank.user.id) ?? [])
      );
  }

  private async loadAvailabilityByUser(userIds: number[]): Promise<Map<number, number[]>> {
    const result = new Map<number, number[]>();
    const uniqueUserIds = Array.from(new Set(userIds.filter((id) => id > 0)));
    if (uniqueUserIds.length === 0) return result;

    const rows = await this.userTemplateAvailabilityRepository
      .createQueryBuilder("availability")
      .leftJoin("availability.user", "user")
      .leftJoin("availability.templateLayout", "templateLayout")
      .where("user.id IN (:...userIds)", { userIds: uniqueUserIds })
      .select(["availability.id", "user.id", "templateLayout.id"])
      .getMany();

    for (const row of rows) {
      const userId = row.user?.id;
      const templateId = row.templateLayout?.id;
      if (!userId || !templateId) continue;
      const list = result.get(userId) ?? [];
      list.push(templateId);
      result.set(userId, list);
    }

    return result;
  }

  async listTemplateLayouts(actor: AuthUser): Promise<PublicTemplateLayout[]> {
    ensureSuperadmin(actor);

    const templates = await this.templateLayoutRepository.find({
      relations: {
        system: true,
        mappings: true
      },
      order: {
        id: "ASC"
      }
    });

    return templates.map((template) => toPublicTemplateLayout(template));
  }

  async listSystems(actor: AuthUser): Promise<PublicConciliationSystem[]> {
    ensureAdminOrSuperadmin(actor);

    const systems = await this.systemRepository.find({
      order: {
        name: "ASC",
        id: "ASC"
      }
    });

    return systems.map((system) => toPublicSystem(system));
  }

  async createSystem(
    payload: CreateConciliationSystemDto,
    actor: AuthUser
  ): Promise<PublicConciliationSystem> {
    ensureSuperadmin(actor);

    try {
      const created = await this.systemRepository.save(
        this.systemRepository.create({
          name: normalizeRequired(payload.name, "name"),
          description: normalizeOptional(payload.description),
          active: payload.active ?? true
        })
      );

      return toPublicSystem(created);
    } catch (error) {
      handleConciliationDatabaseError(error);
    }
  }

  async updateSystem(
    systemId: number,
    payload: UpdateConciliationSystemDto,
    actor: AuthUser
  ): Promise<PublicConciliationSystem> {
    ensureSuperadmin(actor);

    const system = await requireSystem(this.systemRepository, systemId);

    if (payload.name !== undefined) {
      system.name = normalizeRequired(payload.name, "name");
    }
    if (payload.description !== undefined) {
      system.description = normalizeOptional(payload.description);
    }
    if (payload.active !== undefined) {
      system.active = payload.active;
    }

    try {
      const updated = await this.systemRepository.save(system);
      return toPublicSystem(updated);
    } catch (error) {
      handleConciliationDatabaseError(error);
    }
  }

  async deleteSystem(systemId: number, actor: AuthUser): Promise<{ message: string }> {
    ensureSuperadmin(actor);

    const system = await requireSystem(this.systemRepository, systemId);

    const [templateCount, layoutCount] = await Promise.all([
      this.templateLayoutRepository.count({ where: { system: { id: system.id } } }),
      this.layoutRepository.count({ where: { system: { id: system.id } } })
    ]);

    if (templateCount > 0 || layoutCount > 0) {
      throw new BadRequestException(
        "No se puede eliminar el sistema porque ya tiene plantillas base o plantillas asociadas."
      );
    }

    await this.systemRepository.delete(system.id);

    return {
      message: "Sistema eliminado."
    };
  }

  async createUserBank(
    userId: number,
    payload: CreateBankDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts> {
    ensureSuperadmin(actor);

    const user = await this.requireUser(userId);
    const bank = this.userBankRepository.create({
      company: user.company,
      user,
      name: normalizeRequired(payload.name, "name"),
      alias: normalizeOptional(payload.alias),
      description: normalizeOptional(payload.description),
      branch: normalizeOptional(payload.branch),
      active: payload.active ?? true
    });

    try {
      const created = await this.userBankRepository.save(bank);
      return this.requirePublicUserBankWithLayouts(user.id, created.id);
    } catch (error) {
      handleConciliationDatabaseError(error);
    }
  }

  async updateUserBank(
    userId: number,
    bankId: number,
    payload: UpdateBankDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts> {
    ensureSuperadmin(actor);

    const bank = await this.requireUserBank(userId, bankId);

    if (payload.name !== undefined) {
      bank.name = normalizeRequired(payload.name, "name");
    }
    if (payload.alias !== undefined) bank.alias = normalizeOptional(payload.alias);
    if (payload.description !== undefined) {
      bank.description = normalizeOptional(payload.description);
    }
    if (payload.branch !== undefined) {
      bank.branch = normalizeOptional(payload.branch);
    }
    if (payload.active !== undefined) bank.active = payload.active;

    try {
      await this.userBankRepository.save(bank);
      return this.requirePublicUserBankWithLayouts(userId, bankId);
    } catch (error) {
      handleConciliationDatabaseError(error);
    }
  }

  async getUserBankDeletionPreview(
    userId: number,
    bankId: number,
    actor: AuthUser
  ): Promise<PublicUserBankDeletionPreview> {
    ensureSuperadmin(actor);
    return this.buildUserBankDeletionPreview(this.userBankRepository.manager, userId, bankId);
  }

  async deleteUserBank(
    userId: number,
    bankId: number,
    actor: AuthUser
  ): Promise<DeleteUserBankResponse> {
    ensureSuperadmin(actor);

    return this.userBankRepository.manager.transaction(async (manager) => {
      const preview = await this.buildUserBankDeletionPreview(manager, userId, bankId);
      const statementRepository = manager.getRepository(BankStatement);
      const bankRepository = manager.getRepository(BankEntity);

      if (preview.bankStatementCount > 0) {
        await statementRepository
          .createQueryBuilder()
          .delete()
          .from(BankStatement)
          .where("banco_id = :bankId", { bankId })
          .execute();
      }

      await bankRepository.delete(bankId);

      return {
        message: "Banco eliminado.",
        deletedLayouts: preview.layouts.length,
        deletedAccounts: preview.accounts.length,
        deletedReconciliations: 0,
        deletedBankStatements: preview.bankStatementCount
      };
    });
  }

  async createTemplateLayout(
    payload: CreateTemplateLayoutDto,
    actor: AuthUser
  ): Promise<PublicTemplateLayout> {
    ensureSuperadmin(actor);
    ensureMappings(payload.mappings);

    return this.templateLayoutRepository.manager.transaction(async (manager) => {
      const templateRepository = manager.getRepository(TemplateLayout);
      const mappingRepository = manager.getRepository(TemplateLayoutMapping);
      const systemRepository = manager.getRepository(ConciliationSystem);
      const system = await systemRepository.findOne({ where: { id: payload.systemId, active: true } });

      if (!system) {
        throw new NotFoundException("Sistema no encontrado.");
      }

      const template = await templateRepository.save(
        templateRepository.create({
          system,
          name: normalizeRequired(payload.name, "name"),
          description: normalizeOptional(payload.description),
          referenceBankName: normalizeOptional(payload.referenceBankName),
          systemLabel: system.name,
          bankLabel: normalizeRequired(payload.bankLabel ?? "Banco", "bankLabel"),
          autoMatchThreshold: normalizeThreshold(payload.autoMatchThreshold),
          active: payload.active ?? true
        })
      );

      await mappingRepository.save(
        payload.mappings.map((item, index) =>
          mappingRepository.create({
            templateLayout: template,
            fieldKey: normalizeRequired(item.fieldKey, "fieldKey"),
            label: normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: normalizeOptional(item.systemSheet),
            systemColumn: normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: normalizeOptional(item.bankSheet),
            bankColumn: normalizeColumn(item.bankColumn),
            bankStartRow: item.bankStartRow ?? null,
            bankEndRow: item.bankEndRow ?? null,
            bankDataType: item.bankDataType ?? "text"
          })
        )
      );

      const persisted = await templateRepository.findOne({
        where: { id: template.id },
        relations: {
          system: true,
          mappings: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("Plantilla base no encontrada luego de crear.");
      }

      return toPublicTemplateLayout(persisted);
    });
  }

  async updateTemplateLayout(
    templateLayoutId: number,
    payload: UpdateTemplateLayoutDto,
    actor: AuthUser
  ): Promise<PublicTemplateLayout> {
    ensureSuperadmin(actor);

    return this.templateLayoutRepository.manager.transaction(async (manager) => {
      const templateRepository = manager.getRepository(TemplateLayout);
      const mappingRepository = manager.getRepository(TemplateLayoutMapping);
      const systemRepository = manager.getRepository(ConciliationSystem);

      const template = await templateRepository.findOne({
        where: { id: templateLayoutId },
        relations: {
          system: true,
          mappings: true
        }
      });

      if (!template) {
        throw new NotFoundException("Plantilla base no encontrada.");
      }

      if (payload.name !== undefined) template.name = normalizeRequired(payload.name, "name");
      if (payload.description !== undefined) {
        template.description = normalizeOptional(payload.description);
      }
      if (payload.referenceBankName !== undefined) {
        template.referenceBankName = normalizeOptional(payload.referenceBankName);
      }
      if (payload.systemId !== undefined) {
        const system = await systemRepository.findOne({
          where: { id: payload.systemId, active: true }
        });
        if (!system) {
          throw new NotFoundException("Sistema no encontrado.");
        }

        template.system = system;
        template.systemLabel = system.name;
      }
      if (payload.systemLabel !== undefined) {
        template.systemLabel = normalizeRequired(payload.systemLabel, "systemLabel");
      }
      if (payload.bankLabel !== undefined) {
        template.bankLabel = normalizeRequired(payload.bankLabel, "bankLabel");
      }
      if (payload.autoMatchThreshold !== undefined) {
        template.autoMatchThreshold = normalizeThreshold(payload.autoMatchThreshold);
      }
      if (payload.active !== undefined) template.active = payload.active;

      await templateRepository.save(template);

      if (payload.mappings !== undefined) {
        ensureMappings(payload.mappings);

        await mappingRepository
          .createQueryBuilder()
          .delete()
          .from(TemplateLayoutMapping)
          .where("plantilla_base_id = :templateLayoutId", { templateLayoutId })
          .execute();

        await mappingRepository.save(
          payload.mappings.map((item, index) =>
            mappingRepository.create({
              templateLayout: template,
              fieldKey: normalizeRequired(item.fieldKey, "fieldKey"),
              label: normalizeRequired(item.label, "label"),
              sortOrder: item.sortOrder ?? index,
              active: item.active ?? true,
              required: item.required ?? false,
              compareOperator: item.compareOperator ?? "equals",
              weight: item.weight ?? 1,
              tolerance: item.tolerance ?? null,
              systemSheet: normalizeOptional(item.systemSheet),
              systemColumn: normalizeColumn(item.systemColumn),
              systemStartRow: item.systemStartRow ?? null,
              systemEndRow: item.systemEndRow ?? null,
              systemDataType: item.systemDataType ?? "text",
              bankSheet: normalizeOptional(item.bankSheet),
              bankColumn: normalizeColumn(item.bankColumn),
              bankStartRow: item.bankStartRow ?? null,
              bankEndRow: item.bankEndRow ?? null,
              bankDataType: item.bankDataType ?? "text"
            })
          )
        );
      }

      const persisted = await templateRepository.findOne({
        where: { id: templateLayoutId },
        relations: {
          system: true,
          mappings: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("Plantilla base no encontrada luego de actualizar.");
      }

      return toPublicTemplateLayout(persisted);
    });
  }

  async deleteTemplateLayout(
    templateLayoutId: number,
    actor: AuthUser
  ): Promise<{ message: string }> {
    ensureSuperadmin(actor);

    const template = await this.templateLayoutRepository.findOne({
      where: { id: templateLayoutId }
    });

    if (!template) {
      throw new NotFoundException("Plantilla base no encontrada.");
    }

    await this.templateLayoutRepository.delete(templateLayoutId);

    return {
      message: "Plantilla base eliminada."
    };
  }

  async createLayout(
    userId: number,
    bankId: number,
    payload: CreateLayoutDto,
    actor: AuthUser
  ): Promise<PublicLayout> {
    ensureSuperadmin(actor);
    ensureMappings(payload.mappings);

    return this.layoutRepository.manager.transaction(async (manager) => {
      const bankRepository = manager.getRepository(BankEntity);
      const layoutRepository = manager.getRepository(ReconciliationLayout);
      const mappingRepository = manager.getRepository(ReconciliationLayoutMapping);
      const systemRepository = manager.getRepository(ConciliationSystem);

      const userBank = await bankRepository.findOne({
        where: { id: bankId, user: { id: userId } },
        relations: { layouts: true, user: true }
      });

      if (!userBank) {
        throw new NotFoundException("Banco asignado no encontrado.");
      }

      const system = await systemRepository.findOne({
        where: { id: payload.systemId, active: true }
      });

      if (!system) {
        throw new NotFoundException("Sistema no encontrado.");
      }

      const shouldActivate = payload.active ?? (userBank.layouts?.length ?? 0) === 0;

      if (shouldActivate) {
        await layoutRepository
          .createQueryBuilder()
          .update(ReconciliationLayout)
          .set({ active: false })
          .where("banco_id = :bankId", { bankId: userBank.id })
          .execute();
      }

      const createdLayout = await layoutRepository.save(
        layoutRepository.create({
          userBank,
          system,
          name: normalizeRequired(payload.name, "name"),
          description: normalizeOptional(payload.description),
          systemLabel: normalizeRequired(payload.systemLabel ?? system.name, "systemLabel"),
          bankLabel: normalizeRequired(payload.bankLabel ?? userBank.bankName, "bankLabel"),
          autoMatchThreshold: normalizeThreshold(payload.autoMatchThreshold),
          active: shouldActivate
        })
      );

      const mappings = payload.mappings.map((item, index) =>
        mappingRepository.create({
          layout: createdLayout,
          fieldKey: normalizeRequired(item.fieldKey, "fieldKey"),
          label: normalizeRequired(item.label, "label"),
          sortOrder: item.sortOrder ?? index,
          active: item.active ?? true,
          required: item.required ?? false,
          compareOperator: item.compareOperator ?? "equals",
          weight: item.weight ?? 1,
          tolerance: item.tolerance ?? null,
          systemSheet: normalizeOptional(item.systemSheet),
          systemColumn: normalizeColumn(item.systemColumn),
          systemStartRow: item.systemStartRow ?? null,
          systemEndRow: item.systemEndRow ?? null,
          systemDataType: item.systemDataType ?? "text",
          bankSheet: normalizeOptional(item.bankSheet),
          bankColumn: normalizeColumn(item.bankColumn),
          bankStartRow: item.bankStartRow ?? null,
          bankEndRow: item.bankEndRow ?? null,
          bankDataType: item.bankDataType ?? "text"
        })
      );

      await mappingRepository.save(mappings);

      const persisted = await layoutRepository.findOne({
        where: { id: createdLayout.id },
        relations: {
          userBank: true,
          system: true,
          mappings: true,
          templateLayout: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("Plantilla no encontrada luego de crear.");
      }

      return toPublicLayout(persisted);
    });
  }

  async applyTemplateLayoutToBank(
    userId: number,
    bankId: number,
    templateLayoutId: number,
    payload: ApplyTemplateLayoutDto,
    actor: AuthUser
  ): Promise<PublicLayout> {
    ensureSuperadmin(actor);

    return this.layoutRepository.manager.transaction(async (manager) => {
      const bankRepository = manager.getRepository(BankEntity);
      const templateRepository = manager.getRepository(TemplateLayout);
      const layoutRepository = manager.getRepository(ReconciliationLayout);
      const mappingRepository = manager.getRepository(ReconciliationLayoutMapping);

      const userBank = await bankRepository.findOne({
        where: { id: bankId, user: { id: userId } },
        relations: {
          user: true,
          layouts: true
        }
      });

      if (!userBank) {
        throw new NotFoundException("Banco asignado no encontrado.");
      }

      const template = await templateRepository.findOne({
        where: { id: templateLayoutId },
        relations: {
          system: true,
          mappings: true
        }
      });

      if (!template) {
        throw new NotFoundException("Plantilla base no encontrada.");
      }

      const shouldActivate = payload.active ?? template.active ?? (userBank.layouts?.length ?? 0) === 0;

      if (shouldActivate) {
        await layoutRepository
          .createQueryBuilder()
          .update(ReconciliationLayout)
          .set({ active: false })
          .where("banco_id = :bankId", { bankId: userBank.id })
          .execute();
      }

      const createdLayout = await layoutRepository.save(
        layoutRepository.create({
          userBank,
          system: template.system,
          templateLayout: template,
          name: normalizeRequired(payload.name ?? template.name, "name"),
          description: normalizeOptional(payload.description ?? template.description),
          systemLabel: normalizeRequired(
            payload.systemLabel ?? template.system?.name ?? template.systemLabel,
            "systemLabel"
          ),
          bankLabel: normalizeRequired(
            payload.bankLabel ?? userBank.alias ?? userBank.bankName ?? template.bankLabel,
            "bankLabel"
          ),
          autoMatchThreshold: normalizeThreshold(
            payload.autoMatchThreshold ?? template.autoMatchThreshold
          ),
          active: shouldActivate
        })
      );

      await mappingRepository.save(
        sortTemplateMappings(template.mappings ?? []).map((item, index) =>
          mappingRepository.create({
            layout: createdLayout,
            fieldKey: normalizeRequired(item.fieldKey, "fieldKey"),
            label: normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: normalizeOptional(item.systemSheet),
            systemColumn: normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: normalizeOptional(item.bankSheet),
            bankColumn: normalizeColumn(item.bankColumn),
            bankStartRow: item.bankStartRow ?? null,
            bankEndRow: item.bankEndRow ?? null,
            bankDataType: item.bankDataType ?? "text"
          })
        )
      );

      const persisted = await layoutRepository.findOne({
        where: { id: createdLayout.id },
        relations: {
          userBank: true,
          system: true,
          mappings: true,
          templateLayout: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("Plantilla no encontrada luego de copiar la base.");
      }

      return toPublicLayout(persisted);
    });
  }

  async setUserAvailableTemplates(
    userId: number,
    payload: SetBankAvailableTemplatesDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts[]> {
    ensureSuperadmin(actor);

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: {
        company: true
      }
    });

    if (!user) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    const ids = Array.from(new Set(payload.templateLayoutIds));

    if (ids.length > 0) {
      const found = await this.templateLayoutRepository.find({
        where: ids.map((id) => ({ id }))
      });

      if (found.length !== ids.length) {
        const missing = ids.filter((id) => !found.some((tpl) => tpl.id === id));
        throw new NotFoundException(
          `Plantillas base no encontradas: ${missing.join(", ")}`
        );
      }
    }

    await this.userTemplateAvailabilityRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(UserTemplateAvailability);

      await repo
        .createQueryBuilder()
        .delete()
        .from(UserTemplateAvailability)
        .where("usuario_id = :userId", { userId: user.id })
        .execute();

      if (ids.length > 0) {
        await repo.save(
          ids.map((templateId) =>
            repo.create({
              user,
              templateLayout: { id: templateId } as TemplateLayout
            })
          )
        );
      }
    });

    return this.listCatalog(actor, userId);
  }

  async setBankAvailableTemplates(
    userId: number,
    bankId: number,
    payload: SetBankAvailableTemplatesDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts[]> {
    await this.requireUserBank(userId, bankId);
    return this.setUserAvailableTemplates(userId, payload, actor);
  }

  async listBanksWithAvailableTemplatesForAdmin(
    actor: AuthUser
  ): Promise<PublicBankWithAvailableTemplates[]> {
    ensureAdminOrSuperadmin(actor);

    const queryBuilder = this.userBankRepository
      .createQueryBuilder("userBank")
      .leftJoinAndSelect("userBank.user", "user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("userBank.layouts", "layout")
      .leftJoinAndSelect("layout.system", "system")
      .leftJoinAndSelect("layout.mappings", "mapping")
      .leftJoinAndSelect("layout.templateLayout", "layoutTemplate");

    queryBuilder.andWhere("userBank.banco_origen_id IS NULL");

    if (actor.role === Role.ADMIN) {
      queryBuilder.andWhere("user.id = :userId", { userId: actor.id });
    }

    const banks = await queryBuilder.getMany();

    if (banks.length === 0) return [];

    const userIds = Array.from(new Set(banks.map((bank) => bank.user.id)));
    const availabilityRows = await this.userTemplateAvailabilityRepository
      .createQueryBuilder("availability")
      .leftJoinAndSelect("availability.user", "availabilityUser")
      .leftJoinAndSelect("availability.templateLayout", "templateLayout")
      .leftJoinAndSelect("templateLayout.system", "templateSystem")
      .leftJoinAndSelect("templateLayout.mappings", "templateMapping")
      .where("availabilityUser.id IN (:...userIds)", { userIds })
      .getMany();

    const availabilityByUser = new Map<number, TemplateLayout[]>();
    for (const row of availabilityRows) {
      if (!row.user?.id || !row.templateLayout) continue;
      const list = availabilityByUser.get(row.user.id) ?? [];
      list.push(row.templateLayout);
      availabilityByUser.set(row.user.id, list);
    }

    return banks
      .sort((left, right) => {
        const byCompany = (left.user.company?.name ?? "").localeCompare(
          right.user.company?.name ?? ""
        );
        if (byCompany !== 0) return byCompany;
        const byUser = left.user.usrLogin.localeCompare(right.user.usrLogin);
        if (byUser !== 0) return byUser;
        const byBank = left.bankName.localeCompare(right.bankName);
        if (byBank !== 0) return byBank;
        return left.id - right.id;
      })
      .map((bank) => {
        const templates = availabilityByUser.get(bank.user.id) ?? [];
        return {
          ...toPublicUserBank(bank),
          companyId: bank.user.company?.id ?? 0,
          companyName: bank.user.company?.name ?? "",
          layouts: sortLayouts(bank.layouts ?? []).map((layout) =>
            toPublicLayout(layout, bank.id)
          ),
          availableTemplates: templates
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((template) => toPublicTemplateLayout(template))
        };
      });
  }

  async applyAvailableTemplateAsAdmin(
    bankId: number,
    templateLayoutId: number,
    payload: ApplyTemplateLayoutDto,
    actor: AuthUser
  ): Promise<PublicLayout> {
    ensureAdminOrSuperadmin(actor);

    const bank = await this.userBankRepository.findOne({
      where: { id: bankId },
      relations: {
        user: {
          company: true
        }
      }
    });

    if (!bank) {
      throw new NotFoundException("Banco asignado no encontrado.");
    }

    if (
      actor.role === Role.ADMIN &&
      bank.user.id !== actor.id
    ) {
      throw new ForbiddenException(
        "No podes aplicar plantillas a bancos de otro usuario."
      );
    }

    const availability = await this.userTemplateAvailabilityRepository.findOne({
      where: {
        user: { id: bank.user.id },
        templateLayout: { id: templateLayoutId }
      }
    });

    if (!availability) {
      throw new ForbiddenException(
        "La plantilla base no esta habilitada para tu usuario. Pedile al super admin que la habilite."
      );
    }

    return this.applyTemplateLayoutInternal(
      bank.user.id,
      bank.id,
      templateLayoutId,
      payload
    );
  }

  private async applyTemplateLayoutInternal(
    userId: number,
    bankId: number,
    templateLayoutId: number,
    payload: ApplyTemplateLayoutDto
  ): Promise<PublicLayout> {
    return this.layoutRepository.manager.transaction(async (manager) => {
      const bankRepository = manager.getRepository(BankEntity);
      const templateRepository = manager.getRepository(TemplateLayout);
      const layoutRepository = manager.getRepository(ReconciliationLayout);
      const mappingRepository = manager.getRepository(ReconciliationLayoutMapping);

      const userBank = await bankRepository.findOne({
        where: { id: bankId, user: { id: userId } },
        relations: {
          user: true,
          layouts: true
        }
      });

      if (!userBank) {
        throw new NotFoundException("Banco asignado no encontrado.");
      }

      const template = await templateRepository.findOne({
        where: { id: templateLayoutId },
        relations: {
          system: true,
          mappings: true
        }
      });

      if (!template) {
        throw new NotFoundException("Plantilla base no encontrada.");
      }

      const shouldActivate =
        payload.active ?? template.active ?? (userBank.layouts?.length ?? 0) === 0;

      if (shouldActivate) {
        await layoutRepository
          .createQueryBuilder()
          .update(ReconciliationLayout)
          .set({ active: false })
          .where("banco_id = :bankId", { bankId: userBank.id })
          .execute();
      }

      const createdLayout = await layoutRepository.save(
        layoutRepository.create({
          userBank,
          system: template.system,
          templateLayout: template,
          name: normalizeRequired(payload.name ?? template.name, "name"),
          description: normalizeOptional(payload.description ?? template.description),
          systemLabel: normalizeRequired(
            payload.systemLabel ?? template.system?.name ?? template.systemLabel,
            "systemLabel"
          ),
          bankLabel: normalizeRequired(
            payload.bankLabel ?? userBank.alias ?? userBank.bankName ?? template.bankLabel,
            "bankLabel"
          ),
          autoMatchThreshold: normalizeThreshold(
            payload.autoMatchThreshold ?? template.autoMatchThreshold
          ),
          active: shouldActivate
        })
      );

      await mappingRepository.save(
        sortTemplateMappings(template.mappings ?? []).map((item, index) =>
          mappingRepository.create({
            layout: createdLayout,
            fieldKey: normalizeRequired(item.fieldKey, "fieldKey"),
            label: normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: normalizeOptional(item.systemSheet),
            systemColumn: normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: normalizeOptional(item.bankSheet),
            bankColumn: normalizeColumn(item.bankColumn),
            bankStartRow: item.bankStartRow ?? null,
            bankEndRow: item.bankEndRow ?? null,
            bankDataType: item.bankDataType ?? "text"
          })
        )
      );

      const persisted = await layoutRepository.findOne({
        where: { id: createdLayout.id },
        relations: {
          userBank: true,
          system: true,
          mappings: true,
          templateLayout: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("Plantilla no encontrada luego de copiar la base.");
      }

      return toPublicLayout(persisted);
    });
  }

  async activateLayoutAsAdmin(
    bankId: number,
    layoutId: number,
    actor: AuthUser
  ): Promise<void> {
    ensureAdminOrSuperadmin(actor);

    const bank = await this.userBankRepository.findOne({
      where: { id: bankId },
      relations: {
        user: { company: true },
        layouts: true
      }
    });

    if (!bank) {
      throw new NotFoundException("Banco asignado no encontrado.");
    }

    if (
      actor.role === Role.ADMIN &&
      bank.user.id !== actor.id
    ) {
      throw new ForbiddenException(
        "No podes activar plantillas en bancos de otro usuario."
      );
    }

    const layout = bank.layouts?.find((l) => l.id === layoutId);
    if (!layout) {
      throw new NotFoundException("La plantilla no pertenece a este banco.");
    }

    if (layout.active) {
      return;
    }

    await this.layoutRepository.manager.transaction(async (manager) => {
      const layoutRepo = manager.getRepository(ReconciliationLayout);
      await layoutRepo
        .createQueryBuilder()
        .update(ReconciliationLayout)
        .set({ active: false })
        .where("banco_id = :bankId", { bankId: bank.id })
        .execute();

      await layoutRepo.update({ id: layout.id }, { active: true });
    });
  }

  async updateLayout(
    userId: number,
    bankId: number,
    layoutId: number,
    payload: UpdateLayoutDto,
    actor: AuthUser
  ): Promise<PublicLayout> {
    ensureSuperadmin(actor);

    return this.layoutRepository.manager.transaction(async (manager) => {
      const layoutRepository = manager.getRepository(ReconciliationLayout);
      const mappingRepository = manager.getRepository(ReconciliationLayoutMapping);
      const systemRepository = manager.getRepository(ConciliationSystem);

      const layout = await layoutRepository.findOne({
        where: { id: layoutId, userBank: { id: bankId, user: { id: userId } } },
        relations: {
          userBank: {
            user: true
          },
          system: true,
          templateLayout: true,
          mappings: true
        }
      });

      if (!layout) {
        throw new NotFoundException("Plantilla no encontrada.");
      }

      if (payload.name !== undefined) layout.name = normalizeRequired(payload.name, "name");
      if (payload.description !== undefined) {
        layout.description = normalizeOptional(payload.description);
      }
      if (payload.systemId !== undefined) {
        const system = await systemRepository.findOne({
          where: { id: payload.systemId, active: true }
        });

        if (!system) {
          throw new NotFoundException("Sistema no encontrado.");
        }

        layout.system = system;
        layout.systemLabel = system.name;
      }
      if (payload.systemLabel !== undefined) {
        layout.systemLabel = normalizeRequired(payload.systemLabel, "systemLabel");
      }
      if (payload.bankLabel !== undefined) {
        layout.bankLabel = normalizeRequired(payload.bankLabel, "bankLabel");
      }
      if (payload.autoMatchThreshold !== undefined) {
        layout.autoMatchThreshold = normalizeThreshold(payload.autoMatchThreshold);
      }
      if (payload.active !== undefined) layout.active = payload.active;

      if (payload.active) {
        await layoutRepository
          .createQueryBuilder()
          .update(ReconciliationLayout)
          .set({ active: false })
          .where("banco_id = :bankId AND plantilla_id <> :layoutId", { bankId, layoutId })
          .execute();
      }

      await layoutRepository.save(layout);

      if (payload.mappings !== undefined) {
        ensureMappings(payload.mappings);

        await mappingRepository
          .createQueryBuilder()
          .delete()
          .from(ReconciliationLayoutMapping)
          .where("plantilla_id = :layoutId", { layoutId })
          .execute();

        const freshMappings = payload.mappings.map((item, index) =>
          mappingRepository.create({
            layout,
            fieldKey: normalizeRequired(item.fieldKey, "fieldKey"),
            label: normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: normalizeOptional(item.systemSheet),
            systemColumn: normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: normalizeOptional(item.bankSheet),
            bankColumn: normalizeColumn(item.bankColumn),
            bankStartRow: item.bankStartRow ?? null,
            bankEndRow: item.bankEndRow ?? null,
            bankDataType: item.bankDataType ?? "text"
          })
        );

        await mappingRepository.save(freshMappings);
      }

      const updated = await layoutRepository.findOne({
        where: { id: layoutId },
        relations: {
          userBank: true,
          system: true,
          mappings: true,
          templateLayout: true
        }
      });

      if (!updated) {
        throw new NotFoundException("Plantilla no encontrada luego de actualizar.");
      }

      return toPublicLayout(updated);
    });
  }

  async deleteLayout(
    userId: number,
    bankId: number,
    layoutId: number,
    actor: AuthUser
  ): Promise<{ message: string }> {
    ensureSuperadmin(actor);

    return this.layoutRepository.manager.transaction(async (manager) => {
      const layoutRepository = manager.getRepository(ReconciliationLayout);
      const statementRepository = manager.getRepository(BankStatement);

      const layout = await layoutRepository.findOne({
        where: { id: layoutId, userBank: { id: bankId, user: { id: userId } } },
        relations: {
          userBank: true
        }
      });

      if (!layout) {
        throw new NotFoundException("Plantilla no encontrada.");
      }

      const linkedStatements = await statementRepository.count({
        where: {
          layout: {
            id: layoutId
          }
        }
      });

      if (linkedStatements > 0) {
        throw new ConflictException(
          "No se puede eliminar la plantilla porque ya tiene extractos bancarios guardados."
        );
      }

      const wasActive = layout.active;

      await layoutRepository.delete(layoutId);

      if (wasActive) {
        const nextLayout = await layoutRepository.findOne({
          where: {
            userBank: {
              id: bankId
            }
          },
          order: {
            id: "ASC"
          }
        });

        if (nextLayout) {
          nextLayout.active = true;
          await layoutRepository.save(nextLayout);
        }
      }

      return {
        message: "Plantilla eliminada."
      };
    });
  }

  async previewBankStatement(
    actor: AuthUser,
    payload: PreviewBankStatementDto,
    file?: UploadedMemoryFile
  ): Promise<BankStatementPreviewResponse> {
    if (!file?.buffer) {
      throw new BadRequestException("Debes subir el Excel del extracto bancario.");
    }

    const { userBank, layout, companyBankAccount } = await this.requireAccessibleLayoutAndAccount(
      actor,
      payload.userBankId,
      payload.layoutId,
      payload.companyBankAccountId
    );
    const rows = extractRowsFromWorkbook(
      readWorkbook(file.buffer, file.originalname),
      layout.mappings,
      "bank"
    );

    return {
      userBank: toPublicUserBankSummary(userBank),
      companyBankAccount: toPublicCompanyBankAccountSummary(companyBankAccount),
      layout: toPublicLayout(layout),
      fileName: file.originalname,
      rowCount: rows.length,
      rows
    };
  }

  async createBankStatement(
    actor: AuthUser,
    payload: CreateBankStatementDto,
    file?: UploadedMemoryFile
  ): Promise<PublicBankStatementDetail> {
    if (!file?.buffer) {
      throw new BadRequestException("Debes subir el Excel del extracto bancario.");
    }

    const { userBank, layout, companyBankAccount } = await this.requireAccessibleLayoutAndAccount(
      actor,
      payload.userBankId,
      payload.layoutId,
      payload.companyBankAccountId
    );
    const rows = extractRowsFromWorkbook(
      readWorkbook(file.buffer, file.originalname),
      layout.mappings,
      "bank"
    );

    return this.bankStatementRepository.manager.transaction(async (manager) => {
      const statementRepository = manager.getRepository(BankStatement);
      const rowRepository = manager.getRepository(BankStatementRow);
      const userRepository = manager.getRepository(User);

      const persistedActor = await userRepository.findOne({ where: { id: actor.id } });
      if (!persistedActor) {
        throw new NotFoundException("Usuario ejecutor no encontrado.");
      }

      const statement = await statementRepository.save(
        statementRepository.create({
          user: persistedActor,
          userBank,
          companyBankAccount,
          layout,
          name: normalizeRequired(payload.name, "name"),
          fileName: file.originalname,
          status: "saved",
          rowCount: rows.length,
          metadata: toJsonRecord({
            source: "bank_excel",
            uploadedByUserId: actor.id
          })
        })
      );

      if (rows.length > 0) {
        await rowRepository.save(
          rows.map((row) =>
            rowRepository.create({
              statement,
              sourceRowId: row.rowId,
              rowNumber: row.rowNumber,
              values: row.values,
              normalized: row.normalized
            })
          )
        );
      }

      return this.requirePersistedBankStatement(
        manager,
        statement.id,
        "No se pudo recuperar el extracto bancario guardado."
      );
    });
  }

  async listBankStatements(
    actor: AuthUser,
    query: ListBankStatementsQueryDto
  ): Promise<PaginatedResponse<PublicBankStatementSummary>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const queryBuilder = await this.buildBankStatementQuery(actor, query);
    const [statements, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return {
      data: statements.map((statement) => toPublicBankStatementSummary(statement)),
      total,
      page,
      limit,
      lastPage: Math.ceil(total / limit) || 1
    };
  }

  async getBankStatement(actor: AuthUser, statementId: number): Promise<PublicBankStatementDetail> {
    const statement = await this.requireAccessibleBankStatement(actor, statementId);
    return toPublicBankStatementDetail(statement);
  }

  async deleteBankStatement(
    actor: AuthUser,
    statementId: number
  ): Promise<{ id: number; message: string }> {
    const statement = await this.requireAccessibleBankStatement(actor, statementId);
    await this.bankStatementRepository.delete(statement.id);

    return {
      id: statement.id,
      message: "Extracto bancario eliminado."
    };
  }

  async compareBankStatement(
    actor: AuthUser,
    payload: CompareBankStatementDto,
    systemFile?: UploadedMemoryFile
  ): Promise<ConciliationPreviewResponse> {
    if (!systemFile?.buffer) {
      throw new BadRequestException("Debes subir el Excel del sistema para comparar.");
    }

    const statement = await this.requireAccessibleBankStatement(actor, payload.bankStatementId);
    const systemRows = extractRowsFromWorkbook(
      readWorkbook(systemFile.buffer, systemFile.originalname),
      statement.layout.mappings,
      "system"
    );
    const bankRows = sortPreviewRows(
      (statement.rows ?? []).map((row) => toPreviewRow(row))
    );
    const autoMatches = buildAutoMatches(statement.layout, systemRows, bankRows);
    const matchedSystemIds = new Set(autoMatches.map((item) => item.systemRowId));
    const matchedBankIds = new Set(autoMatches.map((item) => item.bankRowId));
    const unmatchedSystemRows = systemRows.filter((row) => !matchedSystemIds.has(row.rowId));
    const unmatchedBankRows = bankRows.filter((row) => !matchedBankIds.has(row.rowId));

    return {
      userBank: toPublicUserBankSummary(statement.userBank),
      companyBankAccount: toPublicCompanyBankAccountSummary(statement.companyBankAccount),
      layout: toPublicLayout(statement.layout, statement.userBank.id),
      bankStatement: toPublicBankStatementSummary(statement),
      systemFileName: systemFile.originalname,
      bankFileName: statement.fileName,
      systemRows,
      bankRows,
      autoMatches,
      manualMatches: [],
      unmatchedSystemRows,
      unmatchedBankRows,
      metrics: buildPreviewMetrics(systemRows.length, bankRows.length, autoMatches.length, 0)
    };
  }

  async getKpis(actor: AuthUser, requestedUserId?: number): Promise<ConciliationKpiResponse> {
    const query = new ListBankStatementsQueryDto();
    query.userId = requestedUserId;

    const statements = await (await this.buildBankStatementQuery(actor, query)).getMany();
    const totals = statements.reduce(
      (accumulator, item) => {
        accumulator.totalReconciliations += 1;
        accumulator.totalUnmatchedBank += item.rowCount;
        return accumulator;
      },
      {
        totalReconciliations: 0,
        totalAutoMatches: 0,
        totalManualMatches: 0,
        totalUnmatchedSystem: 0,
        totalUnmatchedBank: 0,
        totalMatchPercentage: 0
      }
    );

    const bankAggregation = new Map<
      number,
      {
        userBankId: number;
        bankName: string;
        alias: string | null;
        totalReconciliations: number;
      }
    >();

    for (const item of statements) {
      const current = bankAggregation.get(item.userBank.id) ?? {
        userBankId: item.userBank.id,
        bankName: item.userBank.bankName,
        alias: item.userBank.alias,
        totalReconciliations: 0
      };

      current.totalReconciliations += 1;
      bankAggregation.set(item.userBank.id, current);
    }

    return {
      totalReconciliations: totals.totalReconciliations,
      totalAutoMatches: totals.totalAutoMatches,
      totalManualMatches: totals.totalManualMatches,
      totalUnmatchedSystem: totals.totalUnmatchedSystem,
      totalUnmatchedBank: totals.totalUnmatchedBank,
      averageMatchPercentage: 0,
      bankBreakdown: [...bankAggregation.values()]
        .map((item) => ({
          userBankId: item.userBankId,
          bankName: item.bankName,
          alias: item.alias,
          totalReconciliations: item.totalReconciliations,
          averageMatchPercentage: 0
        }))
        .sort((left, right) => right.totalReconciliations - left.totalReconciliations),
      recentReconciliations: statements.slice(0, 12).map((item) => ({
        id: item.id,
        name: item.name,
        bankName: item.userBank.bankName,
        alias: item.userBank.alias,
        companyBankAccountName: item.companyBankAccount?.name ?? null,
        companyBankAccountNumber: item.companyBankAccount?.accountNumber ?? null,
        layoutName: item.layout.name,
        systemName: item.layout.system?.name ?? item.layout.systemLabel,
        matchPercentage: 0,
        autoMatches: 0,
        manualMatches: 0,
        unmatchedSystem: 0,
        unmatchedBank: item.rowCount,
        createdAt: item.createdAt
      }))
    };
  }

  async listGestorAssignmentCatalog(actor: AuthUser): Promise<PublicGestorAssignmentCatalog> {
    ensureAdminOrSuperadmin(actor);

    const [sourceBanks, gestorUsers] = await Promise.all([
      this.listCatalog(actor, actor.id),
      this.userRepository.find({
        where:
          actor.role === Role.ADMIN
            ? {
                company: { id: actor.companyId },
                creatorUser: { id: actor.id }
              }
            : {
                company: { id: actor.companyId }
              },
        relations: {
          role: true,
          company: true,
          creatorUser: true
        },
        order: {
          usrLogin: "ASC",
          id: "ASC"
        }
      })
    ]);

    return {
      gestorUsers: gestorUsers
        .filter((user) => isGestorRole(user.role?.code))
        .map((user) => ({
          id: user.id,
          login: user.usrLogin,
          fullName: buildUserFullName(user),
          creatorUserId: user.creatorUser?.id ?? null,
          creatorUserLogin: user.creatorUser?.usrLogin ?? null
        })),
      sourceBanks
    };
  }

  async syncGestorBankAssignment(
    actor: AuthUser,
    gestorUserId: number,
    sourceBankId: number,
    payload: AssignGestorBankDto
  ): Promise<SyncGestorBankAssignmentResponse> {
    ensureAdminOrSuperadmin(actor);

    const sourceBank = await this.userBankRepository.findOne({
      where: { id: sourceBankId },
      relations: {
        company: true,
        user: true,
        accounts: {
          sourceAccount: true
        },
        layouts: {
          system: true,
          templateLayout: {
            system: true
          },
          mappings: true
        }
      }
    });

    if (!sourceBank) {
      throw new NotFoundException("Banco origen no encontrado.");
    }

    const gestorUser = await this.requireUser(gestorUserId);

    if (!isGestorRole(gestorUser.role?.code)) {
      throw new BadRequestException("Solo podes asignar bancos a usuarios gestores.");
    }

    if (gestorUser.company.id !== sourceBank.company.id) {
      throw new BadRequestException("El gestor y el banco origen deben pertenecer a la misma empresa.");
    }

    if (actor.role === Role.ADMIN) {
      if (sourceBank.user.id !== actor.id) {
        throw new ForbiddenException("Solo podes asignar tus propios bancos a gestores.");
      }

      if (gestorUser.creatorUser?.id && gestorUser.creatorUser.id !== actor.id) {
        throw new ForbiddenException("Solo podes administrar gestores creados por tu usuario admin.");
      }
    }

    const sourceLayouts = [...(sourceBank.layouts ?? [])]
      .filter((layout) =>
        payload.layoutIds?.length ? payload.layoutIds.includes(layout.id) : layout.active
      )
      .sort((left, right) => left.id - right.id);

    if (sourceLayouts.length === 0) {
      throw new BadRequestException("Debes seleccionar al menos un layout para asignar.");
    }

    return {
      gestorUserId: gestorUser.id,
      sourceBankId: sourceBank.id,
      targetBankId: sourceBank.id,
      targetBankName: sourceBank.alias ?? sourceBank.name,
      syncedLayoutIds: sourceLayouts.map((layout) => layout.id),
      syncedAccountIds: (sourceBank.accounts ?? []).map((account) => account.id)
    };
  }

  private async buildBankStatementQuery(
    actor: AuthUser,
    query: ListBankStatementsQueryDto
  ): Promise<SelectQueryBuilder<BankStatement>> {
    const scope = await this.resolveAccessibleUserScope(actor, query.userId);
    const queryBuilder = this.bankStatementRepository
      .createQueryBuilder("statement")
      .leftJoinAndSelect("statement.user", "user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("statement.userBank", "userBank")
      .leftJoinAndSelect("statement.companyBankAccount", "companyBankAccount")
      .leftJoinAndSelect("statement.layout", "layout")
      .leftJoinAndSelect("layout.system", "system")
      .leftJoinAndSelect("layout.templateLayout", "templateLayout")
      .orderBy("statement.createdAt", "DESC")
      .addOrderBy("statement.id", "DESC");

    this.applyUserScopeToQuery(queryBuilder, scope, "user", "company");

    if (query.userBankId) {
      queryBuilder.andWhere("userBank.id = :userBankId", { userBankId: query.userBankId });
    }

    if (query.companyBankAccountId) {
      queryBuilder.andWhere("companyBankAccount.id = :companyBankAccountId", {
        companyBankAccountId: query.companyBankAccountId
      });
    }

    if (query.layoutId) {
      queryBuilder.andWhere("layout.id = :layoutId", { layoutId: query.layoutId });
    }

    if (query.dateFrom) {
      queryBuilder.andWhere("statement.createdAt >= :dateFrom", {
        dateFrom: new Date(`${query.dateFrom}T00:00:00.000Z`)
      });
    }

    if (query.dateTo) {
      queryBuilder.andWhere("statement.createdAt <= :dateTo", {
        dateTo: new Date(`${query.dateTo}T23:59:59.999Z`)
      });
    }

    if (query.search) {
      queryBuilder.andWhere("statement.name ILIKE :search", { search: `%${query.search}%` });
    }

    return queryBuilder;
  }

  private async propagateLayoutToAssignedGestorBanks(
    manager: EntityManager,
    sourceLayout: ReconciliationLayout
  ): Promise<void> {
    const bankRepository = manager.getRepository(BankEntity);
    const layoutRepository = manager.getRepository(ReconciliationLayout);
    const mappingRepository = manager.getRepository(ReconciliationLayoutMapping);

    const hydratedSourceLayout = await layoutRepository.findOne({
      where: { id: sourceLayout.id },
      relations: {
        userBank: true,
        system: true,
        templateLayout: true,
        mappings: true
      }
    });

    if (!hydratedSourceLayout) return;

    const assignedBanks = await bankRepository.find({
      where: {
        sourceBank: {
          id: hydratedSourceLayout.userBank.id
        }
      },
      relations: {
        user: true,
        company: true,
        sourceBank: true
      }
    });

    for (const targetBank of assignedBanks) {
      if (hydratedSourceLayout.active) {
        await layoutRepository
          .createQueryBuilder()
          .update(ReconciliationLayout)
          .set({ active: false })
          .where("banco_id = :bankId", { bankId: targetBank.id })
          .execute();
      }

      let targetLayout = hydratedSourceLayout.templateLayout?.id
        ? await layoutRepository.findOne({
            where: {
              userBank: { id: targetBank.id },
              templateLayout: { id: hydratedSourceLayout.templateLayout.id }
            },
            relations: {
              userBank: true,
              templateLayout: true,
              system: true,
              mappings: true
            }
          })
        : null;

      if (!targetLayout) {
        targetLayout = await layoutRepository.findOne({
          where: {
            userBank: { id: targetBank.id },
            system: { id: hydratedSourceLayout.system.id },
            name: hydratedSourceLayout.name
          },
          relations: {
            userBank: true,
            templateLayout: true,
            system: true,
            mappings: true
          }
        });
      }

      if (!targetLayout) {
        targetLayout = layoutRepository.create({
          userBank: targetBank,
          templateLayout: hydratedSourceLayout.templateLayout,
          system: hydratedSourceLayout.system,
          name: hydratedSourceLayout.name,
          description: hydratedSourceLayout.description,
          systemLabel: hydratedSourceLayout.systemLabel,
          bankLabel: hydratedSourceLayout.bankLabel,
          autoMatchThreshold: hydratedSourceLayout.autoMatchThreshold,
          active: hydratedSourceLayout.active
        });
      } else {
        targetLayout.userBank = targetBank;
        targetLayout.templateLayout = hydratedSourceLayout.templateLayout;
        targetLayout.system = hydratedSourceLayout.system;
        targetLayout.name = hydratedSourceLayout.name;
        targetLayout.description = hydratedSourceLayout.description;
        targetLayout.systemLabel = hydratedSourceLayout.systemLabel;
        targetLayout.bankLabel = hydratedSourceLayout.bankLabel;
        targetLayout.autoMatchThreshold = hydratedSourceLayout.autoMatchThreshold;
        targetLayout.active = hydratedSourceLayout.active;
      }

      const persistedTargetLayout = await layoutRepository.save(targetLayout);

      await mappingRepository
        .createQueryBuilder()
        .delete()
        .from(ReconciliationLayoutMapping)
        .where("plantilla_id = :layoutId", { layoutId: persistedTargetLayout.id })
        .execute();

      const copiedMappings = sortMappings(hydratedSourceLayout.mappings ?? []).map(
        (mapping, index) =>
          mappingRepository.create({
            layout: persistedTargetLayout,
            fieldKey: mapping.fieldKey,
            label: mapping.label,
            sortOrder: mapping.sortOrder ?? index,
            active: mapping.active,
            required: mapping.required,
            compareOperator: mapping.compareOperator,
            weight: mapping.weight,
            tolerance: mapping.tolerance,
            systemSheet: mapping.systemSheet,
            systemColumn: mapping.systemColumn,
            systemStartRow: mapping.systemStartRow,
            systemEndRow: mapping.systemEndRow,
            systemDataType: mapping.systemDataType,
            bankSheet: mapping.bankSheet,
            bankColumn: mapping.bankColumn,
            bankStartRow: mapping.bankStartRow,
            bankEndRow: mapping.bankEndRow,
            bankDataType: mapping.bankDataType
          })
      );

      if (copiedMappings.length > 0) {
        await mappingRepository.save(copiedMappings);
      }
    }
  }

  private async requireAccessibleLayout(
    actor: AuthUser,
    userBankId: number,
    layoutId: number
  ): Promise<{ userBank: BankEntity; layout: ReconciliationLayout }> {
    const layout = await this.layoutRepository.findOne({
      where: {
        id: layoutId,
        userBank: {
          id: userBankId
        }
      },
      relations: {
        userBank: {
          user: {
            company: true
          }
        },
        system: true,
        mappings: true,
        templateLayout: true
      }
    });

    if (!layout) {
      throw new NotFoundException("Plantilla no encontrada para el banco seleccionado.");
    }

    ensureActorCanAccessCompany(actor, layout.userBank.user.company.id);

    return {
      userBank: layout.userBank,
      layout
    };
  }

  private async requireAccessibleLayoutAndAccount(
    actor: AuthUser,
    userBankId: number,
    layoutId: number,
    companyBankAccountId: number
  ): Promise<{
    userBank: BankEntity;
    layout: ReconciliationLayout;
    companyBankAccount: CompanyBankAccount;
  }> {
    const { userBank, layout } = await this.requireAccessibleLayout(actor, userBankId, layoutId);
    const companyBankAccount = await this.requireAccessibleCompanyBankAccount(
      actor,
      companyBankAccountId,
      userBank.id
    );

    return {
      userBank,
      layout,
      companyBankAccount
    };
  }

  private async requirePersistedBankStatement(
    manager: EntityManager,
    statementId: number,
    errorMessage: string
  ): Promise<PublicBankStatementDetail> {
    const persisted = await manager.getRepository(BankStatement).findOne({
      where: { id: statementId },
      relations: {
        user: {
          company: true
        },
        userBank: {
          user: {
            company: true
          }
        },
        companyBankAccount: {
          bank: true
        },
        layout: {
          system: true,
          mappings: true,
          templateLayout: true
        },
        rows: true
      }
    });

    if (!persisted) {
      throw new NotFoundException(errorMessage);
    }

    return toPublicBankStatementDetail(persisted);
  }

  private async requireAccessibleBankStatement(
    actor: AuthUser,
    statementId: number
  ): Promise<BankStatement> {
    const statement = await this.bankStatementRepository.findOne({
      where: { id: statementId },
      relations: {
        user: {
          company: true
        },
        userBank: {
          user: {
            company: true
          }
        },
        companyBankAccount: {
          bank: true
        },
        layout: {
          system: true,
          mappings: true,
          templateLayout: true
        },
        rows: true
      }
    });

    if (!statement) {
      throw new NotFoundException("Extracto bancario no encontrado.");
    }

    ensureActorCanAccessTargetUser(actor, statement.user);

    return statement;
  }

  private async requireAccessibleCompanyBankAccount(
    actor: AuthUser,
    companyBankAccountId: number,
    expectedBankId: number
  ): Promise<CompanyBankAccount> {
    const account = await this.companyBankAccountRepository.findOne({
      where: { id: companyBankAccountId },
      relations: {
        company: true,
        bank: {
          user: {
            company: true
          }
        },
        sourceAccount: true
      }
    });

    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada.");
    }

    if (account.bank.id !== expectedBankId) {
      throw new BadRequestException("La cuenta bancaria seleccionada no pertenece al banco elegido.");
    }

    ensureActorCanAccessCompany(actor, account.company.id);

    return account;
  }

  private async resolveAccessibleUserScope(
    actor: AuthUser,
    requestedUserId?: number
  ): Promise<AccessibleUserScope> {
    if (actor.role === Role.IS_SUPER_ADMIN) {
      return requestedUserId ? { userId: requestedUserId } : {};
    }

    if (actor.role === Role.ADMIN) {
      if (!requestedUserId) {
        return { companyId: actor.companyId };
      }

      const targetUser = await this.requireUser(requestedUserId);
      if (targetUser.company.id !== actor.companyId) {
        throw new ForbiddenException("No podes consultar datos de usuarios de otra empresa.");
      }

      return { userId: targetUser.id };
    }

    if (requestedUserId && requestedUserId !== actor.id) {
      throw new ForbiddenException("No podes consultar datos de otro usuario.");
    }

    return { userId: actor.id };
  }

  private async resolveAccessibleConfigurationScope(
    actor: AuthUser,
    requestedUserId?: number
  ): Promise<AccessibleUserScope> {
    if (actor.role === Role.IS_SUPER_ADMIN) {
      if (!requestedUserId) {
        return {};
      }

      const targetUser = await this.requireUser(requestedUserId);
      return { companyId: targetUser.company.id };
    }

    if (actor.role === Role.ADMIN) {
      if (requestedUserId) {
        const targetUser = await this.requireUser(requestedUserId);
        if (targetUser.company.id !== actor.companyId) {
          throw new ForbiddenException("No podes consultar datos de usuarios de otra empresa.");
        }
      }

      return { companyId: actor.companyId };
    }

    if (requestedUserId && requestedUserId !== actor.id) {
      throw new ForbiddenException("No podes consultar datos de otro usuario.");
    }

    return { companyId: actor.companyId };
  }

  private applyUserScopeToQuery<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    scope: AccessibleUserScope,
    userAlias: string,
    companyAlias: string
  ): void {
    if (scope.userId) {
      queryBuilder.andWhere(`${userAlias}.id = :userId`, { userId: scope.userId });
      return;
    }

    if (scope.companyId) {
      queryBuilder.andWhere(`${companyAlias}.id = :companyId`, { companyId: scope.companyId });
    }
  }

  private async buildUserBankDeletionPreview(
    manager: EntityManager,
    userId: number,
    bankId: number
  ): Promise<PublicUserBankDeletionPreview> {
    const bankRepository = manager.getRepository(BankEntity);
    const companyBankAccountRepository = manager.getRepository(CompanyBankAccount);
    const statementRepository = manager.getRepository(BankStatement);

    const bank = await bankRepository.findOne({
      where: {
        id: bankId,
        user: {
          id: userId
        }
      },
      relations: {
        user: true,
        layouts: true
      }
    });

    if (!bank) {
      throw new NotFoundException("Banco asignado no encontrado.");
    }

    const [accounts, bankStatementCount] = await Promise.all([
      companyBankAccountRepository.find({
        where: {
          bank: {
            id: bankId
          }
        },
        order: {
          name: "ASC",
          id: "ASC"
        }
      }),
      statementRepository
        .createQueryBuilder("statement")
        .where("statement.banco_id = :bankId", { bankId })
        .getCount()
    ]);

    return {
      bank: toPublicUserBank(bank),
      layouts: [...(bank.layouts ?? [])]
        .sort((left, right) => {
          const byName = left.name.localeCompare(right.name);
          if (byName !== 0) return byName;
          return left.id - right.id;
        })
        .map((layout) => toPublicUserBankDeletionLayout(layout)),
      accounts: accounts.map((account) => toPublicUserBankDeletionAccount(account)),
      reconciliationCount: 0,
      bankStatementCount
    };
  }

  private async requireUser(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        company: true,
        role: true,
        creatorUser: true
      }
    });
    if (!user) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    return user;
  }

  private async requireUserBank(userId: number, bankId: number): Promise<BankEntity> {
    const bank = await this.userBankRepository.findOne({
      where: {
        id: bankId,
        user: {
          id: userId
        }
      },
      relations: {
        user: {
          company: true
        },
        accounts: {
          bank: true
        },
        layouts: {
          system: true,
          mappings: true,
          templateLayout: {
            system: true
          }
        }
      }
    });

    if (!bank) {
      throw new NotFoundException("Banco asignado no encontrado.");
    }

    return bank;
  }

  private async requirePublicUserBankWithLayouts(
    userId: number,
    bankId: number
  ): Promise<PublicUserBankWithLayouts> {
    const bank = await this.requireUserBank(userId, bankId);
    const availability = await this.loadAvailabilityByUser([bank.user.id]);
    return toPublicUserBankWithLayouts(bank, availability.get(bank.user.id) ?? []);
  }

}
