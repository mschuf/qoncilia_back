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
  QueryFailedError,
  Repository,
  SelectQueryBuilder
} from "typeorm";
import * as XLSX from "xlsx";
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
import { ListReconciliationsQueryDto } from "./dto/list-reconciliations-query.dto";
import { ParseFileDto } from "./dto/parse-file.dto";
import { PreviewReconciliationDto } from "./dto/preview-reconciliation.dto";
import { SaveReconciliationDto } from "./dto/save-reconciliation.dto";
import { UpdateConciliationSystemDto } from "./dto/update-conciliation-system.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { UpdateLayoutDto } from "./dto/update-layout.dto";
import { UpdateTemplateLayoutDto } from "./dto/update-template-layout.dto";
import { BankEntity } from "./entities/bank.entity";
import { BankStatement } from "./entities/bank-statement.entity";
import { BankStatementRow } from "./entities/bank-statement-row.entity";
import { ReconciliationLayoutMapping } from "./entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "./entities/reconciliation-layout.entity";
import { ReconciliationMatch } from "./entities/reconciliation-match.entity";
import { Reconciliation } from "./entities/reconciliation.entity";
import { TemplateLayoutMapping } from "./entities/template-layout-mapping.entity";
import { TemplateLayout } from "./entities/template-layout.entity";
import {
  CompareOperator,
  BankStatementPreviewResponse,
  ConciliationKpiResponse,
  ConciliationPreviewMatch,
  ConciliationPreviewResponse,
  ConciliationPreviewRow,
  ConciliationRuleResult,
  DeleteReconciliationResponse,
  DeleteUserBankResponse,
  PublicBankStatementDetail,
  PublicBankStatementSummary,
  PublicCompanyBankAccountSummary,
  PublicConciliationSystem,
  PublicGestorAssignmentCatalog,
  PublicLayout,
  PublicLayoutMapping,
  PublicReconciliationDetail,
  PublicReconciliationSummary,
  SyncGestorBankAssignmentResponse,
  PublicTemplateLayout,
  PublicUserBankDeletionAccount,
  PublicUserBankDeletionLayout,
  PublicUserBankDeletionPreview,
  ReconciliationSource,
  ReconciliationSnapshot,
  PublicUserBank,
  PublicUserBankSummary,
  PublicUserBankWithLayouts
} from "./interfaces/conciliation.interfaces";

type UploadedMemoryFile = {
  buffer: Buffer;
  originalname: string;
};

type WorkbookSide = "system" | "bank";
type SupportedNormalizedValue = string | number | null;

type MatchEvaluation = {
  score: number;
  requiredPassed: boolean;
  ruleResults: ConciliationRuleResult[];
  passedRules: number;
};

type InternalPreviewMetrics = {
  totalSystemRows: number;
  totalBankRows: number;
  autoMatches: number;
  manualMatches: number;
  unmatchedSystem: number;
  unmatchedBank: number;
  matchPercentage: number;
};

type AccessibleUserScope = {
  userId?: number;
  companyId?: number;
};

type RowMergeResult = {
  rows: ConciliationPreviewRow[];
  canonicalByRowId: Map<string, ConciliationPreviewRow>;
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
    @InjectRepository(ReconciliationLayout)
    private readonly layoutRepository: Repository<ReconciliationLayout>,
    @InjectRepository(ReconciliationLayoutMapping)
    private readonly layoutMappingRepository: Repository<ReconciliationLayoutMapping>,
    @InjectRepository(Reconciliation)
    private readonly reconciliationRepository: Repository<Reconciliation>,
    @InjectRepository(ReconciliationMatch)
    private readonly reconciliationMatchRepository: Repository<ReconciliationMatch>
  ) {}

  async listCatalog(actor: AuthUser, requestedUserId?: number): Promise<PublicUserBankWithLayouts[]> {
    const scope = await this.resolveAccessibleUserScope(actor, requestedUserId);
    const queryBuilder = this.userBankRepository
      .createQueryBuilder("userBank")
      .leftJoinAndSelect("userBank.user", "user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("userBank.accounts", "account")
      .leftJoinAndSelect("userBank.layouts", "layout")
      .leftJoinAndSelect("layout.system", "system")
      .leftJoinAndSelect("layout.mappings", "mapping")
      .leftJoinAndSelect("layout.templateLayout", "templateLayout");

    this.applyUserScopeToQuery(queryBuilder, scope, "user", "company");

    const banks = await queryBuilder.getMany();

    return banks
      .sort((left, right) => {
        const byUser = left.user.usrLogin.localeCompare(right.user.usrLogin);
        if (byUser !== 0) return byUser;
        const byBank = left.bankName.localeCompare(right.bankName);
        if (byBank !== 0) return byBank;
        return left.id - right.id;
      })
      .map((bank) => this.toPublicUserBankWithLayouts(bank));
  }

  async listTemplateLayouts(actor: AuthUser): Promise<PublicTemplateLayout[]> {
    this.ensureSuperadmin(actor);

    const templates = await this.templateLayoutRepository.find({
      relations: {
        system: true,
        mappings: true
      },
      order: {
        id: "ASC"
      }
    });

    return templates.map((template) => this.toPublicTemplateLayout(template));
  }

  async listSystems(actor: AuthUser): Promise<PublicConciliationSystem[]> {
    this.ensureAdminOrSuperadmin(actor);

    const systems = await this.systemRepository.find({
      order: {
        name: "ASC",
        id: "ASC"
      }
    });

    return systems.map((system) => this.toPublicSystem(system));
  }

  async createSystem(
    payload: CreateConciliationSystemDto,
    actor: AuthUser
  ): Promise<PublicConciliationSystem> {
    this.ensureSuperadmin(actor);

    try {
      const created = await this.systemRepository.save(
        this.systemRepository.create({
          name: this.normalizeRequired(payload.name, "name"),
          description: this.normalizeOptional(payload.description),
          active: payload.active ?? true
        })
      );

      return this.toPublicSystem(created);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateSystem(
    systemId: number,
    payload: UpdateConciliationSystemDto,
    actor: AuthUser
  ): Promise<PublicConciliationSystem> {
    this.ensureSuperadmin(actor);

    const system = await this.requireSystem(systemId);

    if (payload.name !== undefined) {
      system.name = this.normalizeRequired(payload.name, "name");
    }
    if (payload.description !== undefined) {
      system.description = this.normalizeOptional(payload.description);
    }
    if (payload.active !== undefined) {
      system.active = payload.active;
    }

    try {
      const updated = await this.systemRepository.save(system);
      return this.toPublicSystem(updated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async deleteSystem(systemId: number, actor: AuthUser): Promise<{ message: string }> {
    this.ensureSuperadmin(actor);

    const system = await this.requireSystem(systemId);

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
    this.ensureSuperadmin(actor);

    const user = await this.requireUser(userId);
    const bank = this.userBankRepository.create({
      company: user.company,
      user,
      name: this.normalizeRequired(payload.name, "name"),
      alias: this.normalizeOptional(payload.alias),
      description: this.normalizeOptional(payload.description),
      branch: this.normalizeOptional(payload.branch),
      active: payload.active ?? true
    });

    try {
      const created = await this.userBankRepository.save(bank);
      return this.requirePublicUserBankWithLayouts(user.id, created.id);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateUserBank(
    userId: number,
    bankId: number,
    payload: UpdateBankDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts> {
    this.ensureSuperadmin(actor);

    const bank = await this.requireUserBank(userId, bankId);

    if (payload.name !== undefined) {
      bank.name = this.normalizeRequired(payload.name, "name");
    }
    if (payload.alias !== undefined) bank.alias = this.normalizeOptional(payload.alias);
    if (payload.description !== undefined) {
      bank.description = this.normalizeOptional(payload.description);
    }
    if (payload.branch !== undefined) {
      bank.branch = this.normalizeOptional(payload.branch);
    }
    if (payload.active !== undefined) bank.active = payload.active;

    try {
      await this.userBankRepository.save(bank);
      return this.requirePublicUserBankWithLayouts(userId, bankId);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async getUserBankDeletionPreview(
    userId: number,
    bankId: number,
    actor: AuthUser
  ): Promise<PublicUserBankDeletionPreview> {
    this.ensureSuperadmin(actor);
    return this.buildUserBankDeletionPreview(this.userBankRepository.manager, userId, bankId);
  }

  async deleteUserBank(
    userId: number,
    bankId: number,
    actor: AuthUser
  ): Promise<DeleteUserBankResponse> {
    this.ensureSuperadmin(actor);

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
    this.ensureSuperadmin(actor);
    this.ensureMappings(payload.mappings);

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
          name: this.normalizeRequired(payload.name, "name"),
          description: this.normalizeOptional(payload.description),
          referenceBankName: this.normalizeOptional(payload.referenceBankName),
          systemLabel: system.name,
          bankLabel: this.normalizeRequired(payload.bankLabel ?? "Banco", "bankLabel"),
          autoMatchThreshold: this.normalizeThreshold(payload.autoMatchThreshold),
          active: payload.active ?? true
        })
      );

      await mappingRepository.save(
        payload.mappings.map((item, index) =>
          mappingRepository.create({
            templateLayout: template,
            fieldKey: this.normalizeRequired(item.fieldKey, "fieldKey"),
            label: this.normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: this.normalizeOptional(item.systemSheet),
            systemColumn: this.normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: this.normalizeOptional(item.bankSheet),
            bankColumn: this.normalizeColumn(item.bankColumn),
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

      return this.toPublicTemplateLayout(persisted);
    });
  }

  async updateTemplateLayout(
    templateLayoutId: number,
    payload: UpdateTemplateLayoutDto,
    actor: AuthUser
  ): Promise<PublicTemplateLayout> {
    this.ensureSuperadmin(actor);

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

      if (payload.name !== undefined) template.name = this.normalizeRequired(payload.name, "name");
      if (payload.description !== undefined) {
        template.description = this.normalizeOptional(payload.description);
      }
      if (payload.referenceBankName !== undefined) {
        template.referenceBankName = this.normalizeOptional(payload.referenceBankName);
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
        template.systemLabel = this.normalizeRequired(payload.systemLabel, "systemLabel");
      }
      if (payload.bankLabel !== undefined) {
        template.bankLabel = this.normalizeRequired(payload.bankLabel, "bankLabel");
      }
      if (payload.autoMatchThreshold !== undefined) {
        template.autoMatchThreshold = this.normalizeThreshold(payload.autoMatchThreshold);
      }
      if (payload.active !== undefined) template.active = payload.active;

      await templateRepository.save(template);

      if (payload.mappings !== undefined) {
        this.ensureMappings(payload.mappings);

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
              fieldKey: this.normalizeRequired(item.fieldKey, "fieldKey"),
              label: this.normalizeRequired(item.label, "label"),
              sortOrder: item.sortOrder ?? index,
              active: item.active ?? true,
              required: item.required ?? false,
              compareOperator: item.compareOperator ?? "equals",
              weight: item.weight ?? 1,
              tolerance: item.tolerance ?? null,
              systemSheet: this.normalizeOptional(item.systemSheet),
              systemColumn: this.normalizeColumn(item.systemColumn),
              systemStartRow: item.systemStartRow ?? null,
              systemEndRow: item.systemEndRow ?? null,
              systemDataType: item.systemDataType ?? "text",
              bankSheet: this.normalizeOptional(item.bankSheet),
              bankColumn: this.normalizeColumn(item.bankColumn),
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

      return this.toPublicTemplateLayout(persisted);
    });
  }

  async deleteTemplateLayout(
    templateLayoutId: number,
    actor: AuthUser
  ): Promise<{ message: string }> {
    this.ensureSuperadmin(actor);

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
    this.ensureSuperadmin(actor);
    this.ensureMappings(payload.mappings);

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
          name: this.normalizeRequired(payload.name, "name"),
          description: this.normalizeOptional(payload.description),
          systemLabel: this.normalizeRequired(payload.systemLabel ?? system.name, "systemLabel"),
          bankLabel: this.normalizeRequired(payload.bankLabel ?? userBank.bankName, "bankLabel"),
          autoMatchThreshold: this.normalizeThreshold(payload.autoMatchThreshold),
          active: shouldActivate
        })
      );

      const mappings = payload.mappings.map((item, index) =>
        mappingRepository.create({
          layout: createdLayout,
          fieldKey: this.normalizeRequired(item.fieldKey, "fieldKey"),
          label: this.normalizeRequired(item.label, "label"),
          sortOrder: item.sortOrder ?? index,
          active: item.active ?? true,
          required: item.required ?? false,
          compareOperator: item.compareOperator ?? "equals",
          weight: item.weight ?? 1,
          tolerance: item.tolerance ?? null,
          systemSheet: this.normalizeOptional(item.systemSheet),
          systemColumn: this.normalizeColumn(item.systemColumn),
          systemStartRow: item.systemStartRow ?? null,
          systemEndRow: item.systemEndRow ?? null,
          systemDataType: item.systemDataType ?? "text",
          bankSheet: this.normalizeOptional(item.bankSheet),
          bankColumn: this.normalizeColumn(item.bankColumn),
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

      await this.propagateLayoutToAssignedGestorBanks(manager, persisted);

      return this.toPublicLayout(persisted);
    });
  }

  async applyTemplateLayoutToBank(
    userId: number,
    bankId: number,
    templateLayoutId: number,
    payload: ApplyTemplateLayoutDto,
    actor: AuthUser
  ): Promise<PublicLayout> {
    this.ensureSuperadmin(actor);

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
          name: this.normalizeRequired(payload.name ?? template.name, "name"),
          description: this.normalizeOptional(payload.description ?? template.description),
          systemLabel: this.normalizeRequired(
            payload.systemLabel ?? template.system?.name ?? template.systemLabel,
            "systemLabel"
          ),
          bankLabel: this.normalizeRequired(
            payload.bankLabel ?? userBank.alias ?? userBank.bankName ?? template.bankLabel,
            "bankLabel"
          ),
          autoMatchThreshold: this.normalizeThreshold(
            payload.autoMatchThreshold ?? template.autoMatchThreshold
          ),
          active: shouldActivate
        })
      );

      await mappingRepository.save(
        this.sortTemplateMappings(template.mappings ?? []).map((item, index) =>
          mappingRepository.create({
            layout: createdLayout,
            fieldKey: this.normalizeRequired(item.fieldKey, "fieldKey"),
            label: this.normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: this.normalizeOptional(item.systemSheet),
            systemColumn: this.normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: this.normalizeOptional(item.bankSheet),
            bankColumn: this.normalizeColumn(item.bankColumn),
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

      await this.propagateLayoutToAssignedGestorBanks(manager, persisted);

      return this.toPublicLayout(persisted);
    });
  }

  async updateLayout(
    userId: number,
    bankId: number,
    layoutId: number,
    payload: UpdateLayoutDto,
    actor: AuthUser
  ): Promise<PublicLayout> {
    this.ensureSuperadmin(actor);

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

      if (payload.name !== undefined) layout.name = this.normalizeRequired(payload.name, "name");
      if (payload.description !== undefined) {
        layout.description = this.normalizeOptional(payload.description);
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
        layout.systemLabel = this.normalizeRequired(payload.systemLabel, "systemLabel");
      }
      if (payload.bankLabel !== undefined) {
        layout.bankLabel = this.normalizeRequired(payload.bankLabel, "bankLabel");
      }
      if (payload.autoMatchThreshold !== undefined) {
        layout.autoMatchThreshold = this.normalizeThreshold(payload.autoMatchThreshold);
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
        this.ensureMappings(payload.mappings);

        await mappingRepository
          .createQueryBuilder()
          .delete()
          .from(ReconciliationLayoutMapping)
          .where("plantilla_id = :layoutId", { layoutId })
          .execute();

        const freshMappings = payload.mappings.map((item, index) =>
          mappingRepository.create({
            layout,
            fieldKey: this.normalizeRequired(item.fieldKey, "fieldKey"),
            label: this.normalizeRequired(item.label, "label"),
            sortOrder: item.sortOrder ?? index,
            active: item.active ?? true,
            required: item.required ?? false,
            compareOperator: item.compareOperator ?? "equals",
            weight: item.weight ?? 1,
            tolerance: item.tolerance ?? null,
            systemSheet: this.normalizeOptional(item.systemSheet),
            systemColumn: this.normalizeColumn(item.systemColumn),
            systemStartRow: item.systemStartRow ?? null,
            systemEndRow: item.systemEndRow ?? null,
            systemDataType: item.systemDataType ?? "text",
            bankSheet: this.normalizeOptional(item.bankSheet),
            bankColumn: this.normalizeColumn(item.bankColumn),
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

      await this.propagateLayoutToAssignedGestorBanks(manager, updated);

      return this.toPublicLayout(updated);
    });
  }

  async deleteLayout(
    userId: number,
    bankId: number,
    layoutId: number,
    actor: AuthUser
  ): Promise<{ message: string }> {
    this.ensureSuperadmin(actor);

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

  async buildPreview(
    actor: AuthUser,
    payload: PreviewReconciliationDto,
    systemFile?: UploadedMemoryFile,
    bankFile?: UploadedMemoryFile
  ): Promise<ConciliationPreviewResponse> {
    const existingReconciliation = payload.reconciliationId
      ? await this.requireAccessibleReconciliation(actor, payload.reconciliationId)
      : null;
    const resolvedUserBankId = existingReconciliation?.userBank.id ?? payload.userBankId;
    const resolvedLayoutId = existingReconciliation?.layout.id ?? payload.layoutId;
    const resolvedAccountId =
      existingReconciliation?.companyBankAccount?.id ?? payload.companyBankAccountId;

    const { userBank, layout, companyBankAccount } = await this.requireAccessibleLayoutAndAccount(
      actor,
      resolvedUserBankId,
      resolvedLayoutId,
      resolvedAccountId
    );

    const previousSnapshot = existingReconciliation ? this.readSnapshot(existingReconciliation) : null;

    if (!systemFile?.buffer && !previousSnapshot?.systemRows?.length) {
      throw new BadRequestException("Debes subir el Excel del sistema o cargar una conciliacion guardada.");
    }
    if (!bankFile?.buffer && !previousSnapshot?.bankRows?.length) {
      throw new BadRequestException("Debes subir el Excel del banco o cargar una conciliacion guardada.");
    }

    const systemRows = systemFile?.buffer
      ? this.extractRowsFromWorkbook(
          this.readWorkbook(systemFile.buffer, systemFile.originalname),
          layout.mappings,
          "system"
        )
      : previousSnapshot?.systemRows ?? [];
    const bankRows = bankFile?.buffer
      ? this.extractRowsFromWorkbook(
          this.readWorkbook(bankFile.buffer, bankFile.originalname),
          layout.mappings,
          "bank"
        )
      : previousSnapshot?.bankRows ?? [];
    const autoMatches = this.buildAutoMatches(layout, systemRows, bankRows);
    const matchedSystemIds = new Set(autoMatches.map((item) => item.systemRowId));
    const matchedBankIds = new Set(autoMatches.map((item) => item.bankRowId));
    const unmatchedSystemRows = systemRows.filter((row) => !matchedSystemIds.has(row.rowId));
    const unmatchedBankRows = bankRows.filter((row) => !matchedBankIds.has(row.rowId));
    const metrics = this.buildMetrics(systemRows.length, bankRows.length, autoMatches.length, 0);

    return {
      userBank: this.toPublicUserBankSummary(userBank),
      companyBankAccount: this.toPublicCompanyBankAccountSummary(companyBankAccount),
      layout: this.toPublicLayout(layout),
      systemFileName: systemFile?.originalname ?? existingReconciliation?.systemFileName ?? "sistema_guardado",
      bankFileName: bankFile?.originalname ?? existingReconciliation?.bankFileName ?? "banco_guardado",
      systemRows,
      bankRows,
      autoMatches,
      manualMatches: [],
      unmatchedSystemRows,
      unmatchedBankRows,
      metrics
    };
  }

  async parseFile(
    actor: AuthUser,
    payload: ParseFileDto,
    file?: UploadedMemoryFile
  ): Promise<{ rows: ConciliationPreviewRow[]; fileName: string }> {
    if (!file?.buffer) {
      throw new BadRequestException("Debes subir un archivo Excel.");
    }

    const { layout } = await this.requireAccessibleLayout(
      actor,
      payload.userBankId,
      payload.layoutId
    );

    const workbook = this.readWorkbook(file.buffer, file.originalname);
    const rows = this.extractRowsFromWorkbook(workbook, layout.mappings, payload.source);

    return {
      rows,
      fileName: file.originalname
    };
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
    const rows = this.extractRowsFromWorkbook(
      this.readWorkbook(file.buffer, file.originalname),
      layout.mappings,
      "bank"
    );

    return {
      userBank: this.toPublicUserBankSummary(userBank),
      companyBankAccount: this.toPublicCompanyBankAccountSummary(companyBankAccount),
      layout: this.toPublicLayout(layout),
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
    const rows = this.extractRowsFromWorkbook(
      this.readWorkbook(file.buffer, file.originalname),
      layout.mappings,
      "bank"
    );

    return this.bankStatementRepository.manager.transaction(async (manager) => {
      const statementRepository = manager.getRepository(BankStatement);
      const rowRepository = manager.getRepository(BankStatementRow);

      const statement = await statementRepository.save(
        statementRepository.create({
          user: userBank.user,
          userBank,
          companyBankAccount,
          layout,
          name: this.normalizeRequired(payload.name, "name"),
          fileName: file.originalname,
          status: "saved",
          rowCount: rows.length,
          metadata: this.toJsonRecord({
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
  ): Promise<PublicBankStatementSummary[]> {
    const statements = await (await this.buildBankStatementQuery(actor, query)).getMany();
    return statements.map((statement) => this.toPublicBankStatementSummary(statement));
  }

  async getBankStatement(actor: AuthUser, statementId: number): Promise<PublicBankStatementDetail> {
    const statement = await this.requireAccessibleBankStatement(actor, statementId);
    return this.toPublicBankStatementDetail(statement);
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
    const systemRows = this.extractRowsFromWorkbook(
      this.readWorkbook(systemFile.buffer, systemFile.originalname),
      statement.layout.mappings,
      "system"
    );
    const bankRows = this.sortPreviewRows(
      (statement.rows ?? []).map((row) => this.toPreviewRow(row))
    );
    const autoMatches = this.buildAutoMatches(statement.layout, systemRows, bankRows);
    const matchedSystemIds = new Set(autoMatches.map((item) => item.systemRowId));
    const matchedBankIds = new Set(autoMatches.map((item) => item.bankRowId));
    const unmatchedSystemRows = systemRows.filter((row) => !matchedSystemIds.has(row.rowId));
    const unmatchedBankRows = bankRows.filter((row) => !matchedBankIds.has(row.rowId));

    return {
      userBank: this.toPublicUserBankSummary(statement.userBank),
      companyBankAccount: this.toPublicCompanyBankAccountSummary(statement.companyBankAccount),
      layout: this.toPublicLayout(statement.layout, statement.userBank.id),
      bankStatement: this.toPublicBankStatementSummary(statement),
      systemFileName: systemFile.originalname,
      bankFileName: statement.fileName,
      systemRows,
      bankRows,
      autoMatches,
      manualMatches: [],
      unmatchedSystemRows,
      unmatchedBankRows,
      metrics: this.buildMetrics(systemRows.length, bankRows.length, autoMatches.length, 0)
    };
  }

  async saveReconciliation(
    actor: AuthUser,
    payload: SaveReconciliationDto
  ): Promise<PublicReconciliationDetail> {
    const { userBank, layout, companyBankAccount } = await this.requireAccessibleLayoutAndAccount(
      actor,
      payload.userBankId,
      payload.layoutId,
      payload.companyBankAccountId
    );
    const autoMatches = this.coercePreviewMatches(payload.autoMatches);
    const manualMatches = this.coercePreviewMatches(payload.manualMatches);

    if (payload.reconciliationId) {
      return this.updateExistingReconciliation(
        actor,
        {
          ...payload,
          autoMatches,
          manualMatches
        },
        userBank,
        layout,
        companyBankAccount
      );
    }

    const snapshot = this.buildSnapshot(
      userBank,
      companyBankAccount,
      layout,
      payload.systemRows,
      payload.bankRows,
      autoMatches,
      manualMatches
    );
    const comparisonPerformed = payload.comparisonPerformed ?? false;

    return this.reconciliationRepository.manager.transaction(async (manager) => {
      const reconciliationRepository = manager.getRepository(Reconciliation);
      const userRepository = manager.getRepository(User);

      const persistedActor = await userRepository.findOne({ where: { id: actor.id } });
      if (!persistedActor) {
        throw new NotFoundException("Usuario ejecutor no encontrado.");
      }

      const reconciliation = await reconciliationRepository.save(
        reconciliationRepository.create({
          user: persistedActor,
          userBank,
          companyBankAccount,
          layout,
          name: this.normalizeRequired(payload.name, "name"),
          status: this.resolveReconciliationStatus(snapshot, comparisonPerformed),
          updateCount: 0,
          hasSystemData: snapshot.metrics.totalSystemRows > 0,
          hasBankData: snapshot.metrics.totalBankRows > 0,
          systemFileName: this.normalizeOptional(payload.systemFileName),
          bankFileName: this.normalizeOptional(payload.bankFileName),
          totalSystemRows: snapshot.metrics.totalSystemRows,
          totalBankRows: snapshot.metrics.totalBankRows,
          autoMatches: snapshot.metrics.autoMatches,
          manualMatches: snapshot.metrics.manualMatches,
          unmatchedSystem: snapshot.metrics.unmatchedSystem,
          unmatchedBank: snapshot.metrics.unmatchedBank,
          matchPercentage: snapshot.metrics.matchPercentage,
          summarySnapshot: snapshot as unknown as Record<string, unknown>
        })
      );

      await this.replaceReconciliationMatches(manager, reconciliation, snapshot);
      return this.requirePersistedReconciliation(
        manager,
        reconciliation.id,
        "No se pudo recuperar la conciliacion guardada."
      );
    });
  }

  async listReconciliations(
    actor: AuthUser,
    query: ListReconciliationsQueryDto
  ): Promise<PublicReconciliationSummary[]> {
    const reconciliations = await (await this.buildReconciliationQuery(actor, query)).getMany();
    return reconciliations.map((item) => this.toPublicReconciliationSummary(item));
  }

  async getReconciliation(actor: AuthUser, id: number): Promise<PublicReconciliationDetail> {
    const reconciliation = await this.requireAccessibleReconciliation(actor, id);
    return this.toPublicReconciliationDetail(reconciliation);
  }

  async deleteReconciliationSource(
    actor: AuthUser,
    reconciliationId: number,
    source: ReconciliationSource
  ): Promise<PublicReconciliationDetail> {
    if (source !== "system" && source !== "bank") {
      throw new BadRequestException("La fuente a eliminar debe ser system o bank.");
    }

    const reconciliation = await this.requireAccessibleReconciliation(actor, reconciliationId);
    const snapshot = this.readSnapshot(reconciliation);
    const systemRows = source === "system" ? [] : snapshot.systemRows;
    const bankRows = source === "bank" ? [] : snapshot.bankRows;
    const nextSnapshot = this.buildSnapshot(
      reconciliation.userBank,
      reconciliation.companyBankAccount,
      reconciliation.layout,
      systemRows,
      bankRows,
      [],
      []
    );

    return this.reconciliationRepository.manager.transaction(async (manager) => {
      const reconciliationRepository = manager.getRepository(Reconciliation);

      const target = await reconciliationRepository.findOne({
        where: { id: reconciliationId },
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
          }
        }
      });

      if (!target) {
        throw new NotFoundException("Conciliacion no encontrada.");
      }

      this.ensureActorCanAccessTargetUser(actor, target.user);

      target.status = this.resolveReconciliationStatus(nextSnapshot, false);
      target.hasSystemData = nextSnapshot.metrics.totalSystemRows > 0;
      target.hasBankData = nextSnapshot.metrics.totalBankRows > 0;
      target.systemFileName = source === "system" ? null : target.systemFileName;
      target.bankFileName = source === "bank" ? null : target.bankFileName;
      target.totalSystemRows = nextSnapshot.metrics.totalSystemRows;
      target.totalBankRows = nextSnapshot.metrics.totalBankRows;
      target.autoMatches = nextSnapshot.metrics.autoMatches;
      target.manualMatches = nextSnapshot.metrics.manualMatches;
      target.unmatchedSystem = nextSnapshot.metrics.unmatchedSystem;
      target.unmatchedBank = nextSnapshot.metrics.unmatchedBank;
      target.matchPercentage = nextSnapshot.metrics.matchPercentage;
      target.updateCount = (target.updateCount ?? 0) + 1;
      target.summarySnapshot = nextSnapshot as unknown as Record<string, unknown>;

      await reconciliationRepository.save(target);
      await this.replaceReconciliationMatches(manager, target, nextSnapshot);

      return this.requirePersistedReconciliation(
        manager,
        target.id,
        "No se pudo recuperar la conciliacion luego de eliminar la fuente."
      );
    });
  }

  async deleteReconciliation(
    actor: AuthUser,
    reconciliationId: number
  ): Promise<DeleteReconciliationResponse> {
    const reconciliation = await this.requireAccessibleReconciliation(actor, reconciliationId);

    await this.reconciliationRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Reconciliation);
      const target = await repository.findOne({
        where: { id: reconciliationId },
        relations: {
          user: {
            company: true
          }
        }
      });

      if (!target) {
        throw new NotFoundException("Conciliacion no encontrada.");
      }

      this.ensureActorCanAccessTargetUser(actor, target.user);
      await repository.remove(target);
    });

    return {
      id: reconciliation.id,
      message: "Conciliacion eliminada."
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
    this.ensureAdminOrSuperadmin(actor);

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
          fullName: this.buildUserFullName(user),
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
    this.ensureAdminOrSuperadmin(actor);

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

    return this.userBankRepository.manager.transaction(async (manager) => {
      const bankRepository = manager.getRepository(BankEntity);
      const accountRepository = manager.getRepository(CompanyBankAccount);
      const layoutRepository = manager.getRepository(ReconciliationLayout);
      const mappingRepository = manager.getRepository(ReconciliationLayoutMapping);

      let targetBank = await bankRepository.findOne({
        where: {
          user: { id: gestorUser.id },
          sourceBank: { id: sourceBank.id }
        },
        relations: {
          user: true,
          company: true,
          sourceBank: true,
          layouts: {
            templateLayout: true,
            system: true
          }
        }
      });

      if (!targetBank) {
        targetBank = await bankRepository.save(
          bankRepository.create({
            company: gestorUser.company,
            user: gestorUser,
            sourceBank,
            name: sourceBank.name,
            alias: sourceBank.alias,
            description: sourceBank.description,
            branch: sourceBank.branch,
            active: sourceBank.active
          })
        );
      } else {
        targetBank.name = sourceBank.name;
        targetBank.alias = sourceBank.alias;
        targetBank.description = sourceBank.description;
        targetBank.branch = sourceBank.branch;
        targetBank.active = sourceBank.active;
        await bankRepository.save(targetBank);
      }

      const syncedAccountIds: number[] = [];
      for (const sourceAccount of sourceBank.accounts ?? []) {
        let targetAccount = await accountRepository.findOne({
          where: {
            bank: { id: targetBank.id },
            sourceAccount: { id: sourceAccount.id }
          },
          relations: {
            bank: true,
            company: true,
            sourceAccount: true
          }
        });

        if (!targetAccount) {
          targetAccount = accountRepository.create({
            company: gestorUser.company,
            bank: targetBank,
            sourceAccount,
            name: sourceAccount.name,
            currency: sourceAccount.currency,
            accountNumber: sourceAccount.accountNumber,
            bankErpId: sourceAccount.bankErpId,
            majorAccountNumber: sourceAccount.majorAccountNumber,
            paymentAccountNumber: sourceAccount.paymentAccountNumber,
            active: sourceAccount.active
          });
        } else {
          targetAccount.company = gestorUser.company;
          targetAccount.bank = targetBank;
          targetAccount.sourceAccount = sourceAccount;
          targetAccount.name = sourceAccount.name;
          targetAccount.currency = sourceAccount.currency;
          targetAccount.accountNumber = sourceAccount.accountNumber;
          targetAccount.bankErpId = sourceAccount.bankErpId;
          targetAccount.majorAccountNumber = sourceAccount.majorAccountNumber;
          targetAccount.paymentAccountNumber = sourceAccount.paymentAccountNumber;
          targetAccount.active = sourceAccount.active;
        }

        const persistedAccount = await accountRepository.save(targetAccount);
        syncedAccountIds.push(persistedAccount.id);
      }

      const activeSourceLayoutId =
        sourceLayouts.find((layout) => layout.active)?.id ?? sourceLayouts[0]?.id ?? null;

      if (activeSourceLayoutId) {
        await layoutRepository
          .createQueryBuilder()
          .update(ReconciliationLayout)
          .set({ active: false })
          .where("banco_id = :bankId", { bankId: targetBank.id })
          .execute();
      }

      const syncedLayoutIds: number[] = [];
      for (const sourceLayout of sourceLayouts) {
        let targetLayout = sourceLayout.templateLayout?.id
          ? await layoutRepository.findOne({
              where: {
                userBank: { id: targetBank.id },
                templateLayout: { id: sourceLayout.templateLayout.id }
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
              system: { id: sourceLayout.system.id },
              name: sourceLayout.name
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
            templateLayout: sourceLayout.templateLayout,
            system: sourceLayout.system,
            name: sourceLayout.name,
            description: sourceLayout.description,
            systemLabel: sourceLayout.systemLabel,
            bankLabel: sourceLayout.bankLabel,
            autoMatchThreshold: sourceLayout.autoMatchThreshold,
            active: activeSourceLayoutId === sourceLayout.id
          });
          targetLayout = await layoutRepository.save(targetLayout);
        } else {
          targetLayout.userBank = targetBank;
          targetLayout.templateLayout = sourceLayout.templateLayout;
          targetLayout.system = sourceLayout.system;
          targetLayout.name = sourceLayout.name;
          targetLayout.description = sourceLayout.description;
          targetLayout.systemLabel = sourceLayout.systemLabel;
          targetLayout.bankLabel = sourceLayout.bankLabel;
          targetLayout.autoMatchThreshold = sourceLayout.autoMatchThreshold;
          targetLayout.active = activeSourceLayoutId === sourceLayout.id;
          targetLayout = await layoutRepository.save(targetLayout);
        }

        await mappingRepository
          .createQueryBuilder()
          .delete()
          .from(ReconciliationLayoutMapping)
          .where("plantilla_id = :layoutId", { layoutId: targetLayout.id })
          .execute();

        const copiedMappings = this.sortMappings(sourceLayout.mappings ?? []).map((mapping, index) =>
          mappingRepository.create({
            layout: targetLayout,
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

        syncedLayoutIds.push(targetLayout.id);
      }

      return {
        gestorUserId: gestorUser.id,
        sourceBankId: sourceBank.id,
        targetBankId: targetBank.id,
        targetBankName: targetBank.alias ?? targetBank.name,
        syncedLayoutIds,
        syncedAccountIds
      };
    });
  }

  private async buildReconciliationQuery(
    actor: AuthUser,
    query: ListReconciliationsQueryDto
  ): Promise<SelectQueryBuilder<Reconciliation>> {
    const scope = await this.resolveAccessibleUserScope(actor, query.userId);
    const queryBuilder = this.reconciliationRepository
      .createQueryBuilder("reconciliation")
      .leftJoinAndSelect("reconciliation.user", "user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("reconciliation.userBank", "userBank")
      .leftJoinAndSelect("reconciliation.companyBankAccount", "companyBankAccount")
      .leftJoinAndSelect("reconciliation.layout", "layout")
      .leftJoinAndSelect("layout.system", "system")
      .leftJoinAndSelect("layout.templateLayout", "templateLayout")
      .orderBy("reconciliation.createdAt", "DESC");

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
      queryBuilder.andWhere("reconciliation.createdAt >= :dateFrom", {
        dateFrom: new Date(`${query.dateFrom}T00:00:00.000Z`)
      });
    }

    if (query.dateTo) {
      queryBuilder.andWhere("reconciliation.createdAt <= :dateTo", {
        dateTo: new Date(`${query.dateTo}T23:59:59.999Z`)
      });
    }

    return queryBuilder;
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

      const copiedMappings = this.sortMappings(hydratedSourceLayout.mappings ?? []).map(
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

    this.ensureActorCanAccessTargetUser(actor, layout.userBank.user);

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

  private async updateExistingReconciliation(
    actor: AuthUser,
    payload: SaveReconciliationDto & {
      autoMatches: ConciliationPreviewMatch[];
      manualMatches: ConciliationPreviewMatch[];
    },
    userBank: BankEntity,
    layout: ReconciliationLayout,
    companyBankAccount: CompanyBankAccount
  ): Promise<PublicReconciliationDetail> {
    return this.reconciliationRepository.manager.transaction(async (manager) => {
      const reconciliationRepository = manager.getRepository(Reconciliation);

      const reconciliation = await reconciliationRepository.findOne({
        where: { id: payload.reconciliationId },
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
          }
        }
      });

      if (!reconciliation) {
        throw new NotFoundException("Conciliacion a actualizar no encontrada.");
      }

      this.ensureActorCanAccessTargetUser(actor, reconciliation.user);

      if (reconciliation.userBank.id !== userBank.id || reconciliation.layout.id !== layout.id) {
        throw new BadRequestException(
          "La conciliacion seleccionada no corresponde al banco/plantilla actual."
        );
      }

      const previousSnapshot = this.readSnapshot(reconciliation);
      const mergedSystemRows = this.mergePreviewRows(
        layout.mappings,
        previousSnapshot.systemRows,
        payload.systemRows
      );
      const mergedBankRows = this.mergePreviewRows(
        layout.mappings,
        previousSnapshot.bankRows,
        payload.bankRows
      );
      const comparisonPerformed = payload.comparisonPerformed ?? false;
      const mergedManualMatches = comparisonPerformed
        ? this.mergeManualMatches(
            layout.mappings,
            mergedSystemRows,
            mergedBankRows,
            [...previousSnapshot.manualMatches, ...payload.manualMatches]
          )
        : [];
      const lockedSystemIds = new Set(mergedManualMatches.map((item) => item.systemRowId));
      const lockedBankIds = new Set(mergedManualMatches.map((item) => item.bankRowId));
      const mergedAutoMatches = comparisonPerformed
        ? this.buildAutoMatches(
            layout,
            mergedSystemRows.rows,
            mergedBankRows.rows,
            lockedSystemIds,
            lockedBankIds
          )
        : [];
      const snapshot = this.buildSnapshot(
        userBank,
        companyBankAccount,
        layout,
        mergedSystemRows.rows,
        mergedBankRows.rows,
        mergedAutoMatches,
        mergedManualMatches
      );

      reconciliation.userBank = userBank;
      reconciliation.companyBankAccount = companyBankAccount;
      reconciliation.layout = layout;
      reconciliation.name = this.normalizeRequired(payload.name, "name");
      reconciliation.status = this.resolveReconciliationStatus(snapshot, comparisonPerformed);
      reconciliation.hasSystemData = snapshot.metrics.totalSystemRows > 0;
      reconciliation.hasBankData = snapshot.metrics.totalBankRows > 0;
      reconciliation.systemFileName =
        this.normalizeOptional(payload.systemFileName) ?? reconciliation.systemFileName;
      reconciliation.bankFileName =
        this.normalizeOptional(payload.bankFileName) ?? reconciliation.bankFileName;
      reconciliation.totalSystemRows = snapshot.metrics.totalSystemRows;
      reconciliation.totalBankRows = snapshot.metrics.totalBankRows;
      reconciliation.autoMatches = snapshot.metrics.autoMatches;
      reconciliation.manualMatches = snapshot.metrics.manualMatches;
      reconciliation.unmatchedSystem = snapshot.metrics.unmatchedSystem;
      reconciliation.unmatchedBank = snapshot.metrics.unmatchedBank;
      reconciliation.matchPercentage = snapshot.metrics.matchPercentage;
      reconciliation.updateCount = (reconciliation.updateCount ?? 0) + 1;
      reconciliation.summarySnapshot = snapshot as unknown as Record<string, unknown>;

      await reconciliationRepository.save(reconciliation);
      await this.replaceReconciliationMatches(manager, reconciliation, snapshot);

      return this.requirePersistedReconciliation(
        manager,
        reconciliation.id,
        "No se pudo recuperar la conciliacion actualizada."
      );
    });
  }

  private readSnapshot(reconciliation: Reconciliation): ReconciliationSnapshot {
    const snapshot = reconciliation.summarySnapshot as ReconciliationSnapshot | null;
    if (
      !snapshot ||
      !Array.isArray(snapshot.systemRows) ||
      !Array.isArray(snapshot.bankRows) ||
      !Array.isArray(snapshot.autoMatches) ||
      !Array.isArray(snapshot.manualMatches)
    ) {
      throw new BadRequestException(
        "La conciliacion seleccionada no tiene un snapshot reutilizable para actualizar."
      );
    }

    return {
      ...snapshot,
      userBank: snapshot.userBank ?? this.toPublicUserBankSummary(reconciliation.userBank),
      companyBankAccount:
        snapshot.companyBankAccount ??
        this.toPublicCompanyBankAccountSummary(
          reconciliation.companyBankAccount ??
            this.throwMissingCompanyBankAccountForSnapshot(reconciliation.id)
        ),
      layout: snapshot.layout ?? this.toPublicLayout(reconciliation.layout)
    };
  }

  private coercePreviewMatches(
    matches: SaveReconciliationDto["autoMatches"] | SaveReconciliationDto["manualMatches"]
  ): ConciliationPreviewMatch[] {
    return matches.map((match) => ({
      systemRowId: match.systemRowId,
      bankRowId: match.bankRowId,
      systemRowNumber: match.systemRowNumber,
      bankRowNumber: match.bankRowNumber,
      score: match.score,
      status: match.status,
      ruleResults: match.ruleResults.map((rule) => ({
        fieldKey: rule.fieldKey,
        label: rule.label,
        passed: rule.passed,
        compareOperator: rule.compareOperator as CompareOperator,
        systemValue: rule.systemValue ?? null,
        bankValue: rule.bankValue ?? null
      }))
    }));
  }

  private buildSnapshot(
    userBank: BankEntity,
    companyBankAccount: CompanyBankAccount,
    layout: ReconciliationLayout,
    systemRows: ConciliationPreviewRow[],
    bankRows: ConciliationPreviewRow[],
    autoMatches: ConciliationPreviewMatch[],
    manualMatches: ConciliationPreviewMatch[]
  ): ReconciliationSnapshot {
    const matchedSystemIds = new Set<string>();
    const matchedBankIds = new Set<string>();

    for (const match of [...autoMatches, ...manualMatches]) {
      matchedSystemIds.add(match.systemRowId);
      matchedBankIds.add(match.bankRowId);
    }

    const sortedSystemRows = this.sortPreviewRows(systemRows);
    const sortedBankRows = this.sortPreviewRows(bankRows);
    const unmatchedSystemRows = sortedSystemRows.filter((row) => !matchedSystemIds.has(row.rowId));
    const unmatchedBankRows = sortedBankRows.filter((row) => !matchedBankIds.has(row.rowId));
    const metrics = this.buildMetrics(
      sortedSystemRows.length,
      sortedBankRows.length,
      autoMatches.length,
      manualMatches.length
    );

    return {
      userBank: this.toPublicUserBankSummary(userBank),
      companyBankAccount: this.toPublicCompanyBankAccountSummary(companyBankAccount),
      layout: this.toPublicLayout(layout),
      systemRows: sortedSystemRows,
      bankRows: sortedBankRows,
      autoMatches: this.sortPreviewMatches(autoMatches),
      manualMatches: this.sortPreviewMatches(manualMatches),
      unmatchedSystemRows,
      unmatchedBankRows,
      metrics
    };
  }

  private mergePreviewRows(
    mappings: ReconciliationLayoutMapping[],
    existingRows: ConciliationPreviewRow[],
    incomingRows: ConciliationPreviewRow[]
  ): RowMergeResult {
    const rows = [...existingRows];
    const canonicalByRowId = new Map<string, ConciliationPreviewRow>();
    const buckets = new Map<string, ConciliationPreviewRow[]>();
    const reusedCountBySignature = new Map<string, number>();

    for (const row of existingRows) {
      canonicalByRowId.set(row.rowId, row);
      const signature = this.buildRowSignature(mappings, row);
      const bucket = buckets.get(signature) ?? [];
      bucket.push(row);
      buckets.set(signature, bucket);
    }

    for (const row of incomingRows) {
      const signature = this.buildRowSignature(mappings, row);
      const bucket = buckets.get(signature) ?? [];
      const reusedCount = reusedCountBySignature.get(signature) ?? 0;
      const existingCanonical = reusedCount < bucket.length ? bucket[reusedCount] : undefined;

      if (existingCanonical) {
        canonicalByRowId.set(row.rowId, existingCanonical);
        reusedCountBySignature.set(signature, reusedCount + 1);
        continue;
      }

      canonicalByRowId.set(row.rowId, row);
      bucket.push(row);
      buckets.set(signature, bucket);
      reusedCountBySignature.set(signature, reusedCount + 1);
      rows.push(row);
    }

    return {
      rows: this.sortPreviewRows(rows),
      canonicalByRowId
    };
  }

  private mergeManualMatches(
    mappings: ReconciliationLayoutMapping[],
    systemRows: RowMergeResult,
    bankRows: RowMergeResult,
    matches: ConciliationPreviewMatch[]
  ): ConciliationPreviewMatch[] {
    const uniqueMatches = new Map<string, ConciliationPreviewMatch>();

    for (const match of matches) {
      const systemRow = systemRows.canonicalByRowId.get(match.systemRowId);
      const bankRow = bankRows.canonicalByRowId.get(match.bankRowId);

      if (!systemRow || !bankRow) {
        continue;
      }

      const pairKey = `${systemRow.rowId}::${bankRow.rowId}`;

      if (uniqueMatches.has(pairKey)) {
        continue;
      }

      const evaluation = this.evaluateMatch(
        this.sortMappings(mappings).filter((item) => item.active),
        systemRow,
        bankRow
      );

      uniqueMatches.set(pairKey, {
        systemRowId: systemRow.rowId,
        bankRowId: bankRow.rowId,
        systemRowNumber: systemRow.rowNumber,
        bankRowNumber: bankRow.rowNumber,
        score: this.roundNumber(evaluation.score),
        status: "manual",
        ruleResults: evaluation.ruleResults
      });
    }

    return this.sortPreviewMatches([...uniqueMatches.values()]);
  }

  private async replaceReconciliationMatches(
    manager: EntityManager,
    reconciliation: Reconciliation,
    snapshot: ReconciliationSnapshot
  ): Promise<void> {
    const reconciliationMatchRepository = manager.getRepository(ReconciliationMatch);
    const systemRowMap = new Map(snapshot.systemRows.map((row) => [row.rowId, row]));
    const bankRowMap = new Map(snapshot.bankRows.map((row) => [row.rowId, row]));

    await reconciliationMatchRepository
      .createQueryBuilder()
      .delete()
      .from(ReconciliationMatch)
      .where("conciliacion_id = :reconciliationId", { reconciliationId: reconciliation.id })
      .execute();

    const matches: ReconciliationMatch[] = [];

    for (const match of snapshot.autoMatches) {
      matches.push(
        reconciliationMatchRepository.create({
          reconciliation,
          status: "auto",
          systemRowId: match.systemRowId,
          bankRowId: match.bankRowId,
          systemRowNumber: match.systemRowNumber,
          bankRowNumber: match.bankRowNumber,
          score: match.score,
          details: this.toJsonRecord({ ruleResults: match.ruleResults }),
          systemPayload: this.toJsonRecord(systemRowMap.get(match.systemRowId) ?? null),
          bankPayload: this.toJsonRecord(bankRowMap.get(match.bankRowId) ?? null)
        })
      );
    }

    for (const match of snapshot.manualMatches) {
      matches.push(
        reconciliationMatchRepository.create({
          reconciliation,
          status: "manual",
          systemRowId: match.systemRowId,
          bankRowId: match.bankRowId,
          systemRowNumber: match.systemRowNumber,
          bankRowNumber: match.bankRowNumber,
          score: match.score,
          details: this.toJsonRecord({ ruleResults: match.ruleResults }),
          systemPayload: this.toJsonRecord(systemRowMap.get(match.systemRowId) ?? null),
          bankPayload: this.toJsonRecord(bankRowMap.get(match.bankRowId) ?? null)
        })
      );
    }

    for (const row of snapshot.unmatchedSystemRows) {
      matches.push(
        reconciliationMatchRepository.create({
          reconciliation,
          status: "unmatched_system",
          systemRowId: row.rowId,
          bankRowId: null,
          systemRowNumber: row.rowNumber,
          bankRowNumber: null,
          score: 0,
          details: null,
          systemPayload: this.toJsonRecord(row),
          bankPayload: null
        })
      );
    }

    for (const row of snapshot.unmatchedBankRows) {
      matches.push(
        reconciliationMatchRepository.create({
          reconciliation,
          status: "unmatched_bank",
          systemRowId: null,
          bankRowId: row.rowId,
          systemRowNumber: null,
          bankRowNumber: row.rowNumber,
          score: 0,
          details: null,
          systemPayload: null,
          bankPayload: this.toJsonRecord(row)
        })
      );
    }

    if (matches.length > 0) {
      await reconciliationMatchRepository.save(matches);
    }
  }

  private async requirePersistedReconciliation(
    manager: EntityManager,
    reconciliationId: number,
    errorMessage: string
  ): Promise<PublicReconciliationDetail> {
    const persisted = await manager.getRepository(Reconciliation).findOne({
      where: { id: reconciliationId },
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
          templateLayout: true
        }
      }
    });

    if (!persisted) {
      throw new NotFoundException(errorMessage);
    }

    return this.toPublicReconciliationDetail(persisted);
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

    return this.toPublicBankStatementDetail(persisted);
  }

  private async requireAccessibleReconciliation(
    actor: AuthUser,
    reconciliationId: number
  ): Promise<Reconciliation> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id: reconciliationId },
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
          templateLayout: true,
          mappings: true
        }
      }
    });

    if (!reconciliation) {
      throw new NotFoundException("Conciliacion no encontrada.");
    }

    this.ensureActorCanAccessTargetUser(actor, reconciliation.user);

    return reconciliation;
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

    this.ensureActorCanAccessTargetUser(actor, statement.user);

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

    this.ensureActorCanAccessTargetUser(actor, account.bank.user);

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

  private ensureActorCanAccessTargetUser(actor: AuthUser, targetUser: User): void {
    if (actor.role === Role.IS_SUPER_ADMIN) {
      return;
    }

    if (actor.role === Role.ADMIN && targetUser.company.id === actor.companyId) {
      return;
    }

    if (targetUser.id === actor.id) {
      return;
    }

    throw new ForbiddenException("No tenes permisos para ver datos de este usuario.");
  }

  private buildAutoMatches(
    layout: ReconciliationLayout,
    systemRows: ConciliationPreviewRow[],
    bankRows: ConciliationPreviewRow[],
    excludedSystemIds: Set<string> = new Set<string>(),
    excludedBankIds: Set<string> = new Set<string>()
  ): ConciliationPreviewMatch[] {
    const mappings = this.sortMappings(layout.mappings).filter((item) => item.active);
    const threshold = this.normalizeThreshold(layout.autoMatchThreshold);
    const candidates: Array<ConciliationPreviewMatch & { passedRules: number }> = [];

    for (const systemRow of systemRows) {
      if (excludedSystemIds.has(systemRow.rowId)) {
        continue;
      }

      for (const bankRow of bankRows) {
        if (excludedBankIds.has(bankRow.rowId)) {
          continue;
        }

        const evaluation = this.evaluateMatch(mappings, systemRow, bankRow);
        if (!evaluation.requiredPassed) continue;
        if (evaluation.score < threshold) continue;

        candidates.push({
          systemRowId: systemRow.rowId,
          bankRowId: bankRow.rowId,
          systemRowNumber: systemRow.rowNumber,
          bankRowNumber: bankRow.rowNumber,
          score: evaluation.score,
          status: "auto",
          ruleResults: evaluation.ruleResults,
          passedRules: evaluation.passedRules
        });
      }
    }

    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.passedRules !== left.passedRules) return right.passedRules - left.passedRules;
      if (left.systemRowNumber !== right.systemRowNumber) {
        return left.systemRowNumber - right.systemRowNumber;
      }
      return left.bankRowNumber - right.bankRowNumber;
    });

    const matchedSystemIds = new Set<string>(excludedSystemIds);
    const matchedBankIds = new Set<string>(excludedBankIds);
    const matches: ConciliationPreviewMatch[] = [];

    for (const candidate of candidates) {
      if (matchedSystemIds.has(candidate.systemRowId) || matchedBankIds.has(candidate.bankRowId)) {
        continue;
      }

      matchedSystemIds.add(candidate.systemRowId);
      matchedBankIds.add(candidate.bankRowId);
      matches.push({
        systemRowId: candidate.systemRowId,
        bankRowId: candidate.bankRowId,
        systemRowNumber: candidate.systemRowNumber,
        bankRowNumber: candidate.bankRowNumber,
        score: this.roundNumber(candidate.score),
        status: "auto",
        ruleResults: candidate.ruleResults
      });
    }

    return matches;
  }

  private evaluateMatch(
    mappings: ReconciliationLayoutMapping[],
    systemRow: ConciliationPreviewRow,
    bankRow: ConciliationPreviewRow
  ): MatchEvaluation {
    let totalWeight = 0;
    let matchedWeight = 0;
    let requiredPassed = true;
    let passedRules = 0;

    const ruleResults = mappings.map((mapping) => {
      const systemValue = (systemRow.normalized[mapping.fieldKey] ?? null) as SupportedNormalizedValue;
      const bankValue = (bankRow.normalized[mapping.fieldKey] ?? null) as SupportedNormalizedValue;
      const shouldEvaluate = mapping.required || systemValue !== null || bankValue !== null;

      let passed = true;
      if (shouldEvaluate) {
        passed = this.compareValues(mapping.compareOperator as CompareOperator, systemValue, bankValue, {
          tolerance: mapping.tolerance ?? undefined
        });
        totalWeight += mapping.weight;
        if (passed) {
          matchedWeight += mapping.weight;
          passedRules += 1;
        }
      }

      if (mapping.required && !passed) {
        requiredPassed = false;
      }

      return {
        fieldKey: mapping.fieldKey,
        label: mapping.label,
        passed,
        compareOperator: mapping.compareOperator as CompareOperator,
        systemValue,
        bankValue
      };
    });

    return {
      score: totalWeight > 0 ? matchedWeight / totalWeight : 0,
      requiredPassed,
      ruleResults,
      passedRules
    };
  }

  private compareValues(
    operator: CompareOperator,
    systemValue: SupportedNormalizedValue,
    bankValue: SupportedNormalizedValue,
    options: { tolerance?: number }
  ): boolean {
    if (systemValue === null && bankValue === null) {
      return true;
    }
    if (systemValue === null || bankValue === null) {
      return false;
    }

    switch (operator) {
      case "contains": {
        const left = String(systemValue);
        const right = String(bankValue);
        return left.includes(right) || right.includes(left);
      }
      case "starts_with": {
        const left = String(systemValue);
        const right = String(bankValue);
        return left.startsWith(right) || right.startsWith(left);
      }
      case "ends_with": {
        const left = String(systemValue);
        const right = String(bankValue);
        return left.endsWith(right) || right.endsWith(left);
      }
      case "numeric_equals": {
        const left = this.toNumber(systemValue);
        const right = this.toNumber(bankValue);
        if (left === null || right === null) return false;
        return Math.abs(left - right) <= (options.tolerance ?? 0);
      }
      case "date_equals": {
        const left = this.toDateDayNumber(systemValue);
        const right = this.toDateDayNumber(bankValue);
        if (left === null || right === null) {
          return this.normalizeDateValue(systemValue) === this.normalizeDateValue(bankValue);
        }

        return Math.abs(left - right) <= Math.abs(options.tolerance ?? 0);
      }
      case "equals":
      default: {
        if (typeof systemValue === "number" || typeof bankValue === "number") {
          const left = this.toNumber(systemValue);
          const right = this.toNumber(bankValue);
          if (left !== null && right !== null) {
            return Math.abs(left - right) <= (options.tolerance ?? 0);
          }
        }

        return String(systemValue) === String(bankValue);
      }
    }
  }

  private extractRowsFromWorkbook(
    workbook: XLSX.WorkBook,
    mappings: ReconciliationLayoutMapping[],
    side: WorkbookSide
  ): ConciliationPreviewRow[] {
    const activeMappings = this.sortMappings(mappings).filter((mapping) => mapping.active);
    if (activeMappings.length === 0) {
      throw new BadRequestException("La plantilla no tiene mapeos activos para comparar.");
    }

    const rows = new Map<string, ConciliationPreviewRow>();

    for (const mapping of activeMappings) {
      const sheetName = this.resolveSheetName(workbook, side === "system" ? mapping.systemSheet : mapping.bankSheet);
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        throw new BadRequestException(`La hoja ${sheetName} no existe en el Excel subido.`);
      }

      const column = this.normalizeColumn(
        side === "system" ? mapping.systemColumn : mapping.bankColumn
      );
      if (!column) {
        throw new BadRequestException(
          `El campo ${mapping.label} no tiene columna configurada para ${side}.`
        );
      }

      const startRow = side === "system" ? mapping.systemStartRow : mapping.bankStartRow;
      const configuredEndRow = side === "system" ? mapping.systemEndRow : mapping.bankEndRow;
      const lastRow = this.resolveWorksheetLastRow(worksheet);
      const firstRow = Math.max(1, startRow ?? 1);
      const finalRow = Math.max(firstRow, Math.min(configuredEndRow ?? lastRow, lastRow));
      const dataType = side === "system" ? mapping.systemDataType : mapping.bankDataType;

      for (let rowNumber = firstRow; rowNumber <= finalRow; rowNumber += 1) {
        const rowId = `${sheetName}:${rowNumber}`;
        const targetRow = rows.get(rowId) ?? {
          rowId,
          rowNumber,
          values: {},
          normalized: {}
        };

        const cell = this.resolveCellFromColumns(worksheet, column, rowNumber);
        targetRow.values[mapping.fieldKey] = this.stringifyCellValue(cell);
        targetRow.normalized[mapping.fieldKey] = this.normalizeByDataType(
          cell?.v ?? cell?.w ?? null,
          dataType
        );
        rows.set(rowId, targetRow);
      }
    }

    return [...rows.values()]
      .filter((row) => Object.values(row.values).some((value) => value !== null))
      .sort((left, right) => {
        if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
        return left.rowId.localeCompare(right.rowId);
      });
  }

  private readWorkbook(buffer: Buffer, fileName: string): XLSX.WorkBook {
    try {
      return XLSX.read(buffer, {
        type: "buffer",
        cellDates: true
      });
    } catch {
      throw new BadRequestException(`No se pudo leer el Excel ${fileName}.`);
    }
  }

  private resolveSheetName(workbook: XLSX.WorkBook, configuredSheet?: string | null): string {
    const candidate = configuredSheet?.trim();
    if (candidate) {
      if (!workbook.SheetNames.includes(candidate)) {
        throw new BadRequestException(`La hoja ${candidate} no existe en el archivo Excel.`);
      }

      return candidate;
    }

    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new BadRequestException("El Excel no contiene hojas.");
    }

    return firstSheet;
  }

  private resolveWorksheetLastRow(worksheet: XLSX.WorkSheet): number {
    const ref = worksheet["!ref"];
    if (!ref) return 1;
    const range = XLSX.utils.decode_range(ref);
    return Math.max(1, range.e.r + 1);
  }

  private stringifyCellValue(cell?: XLSX.CellObject): string | null {
    const rawValue = cell?.w ?? cell?.v ?? null;
    if (rawValue === null || rawValue === undefined) return null;
    if (rawValue instanceof Date) return rawValue.toISOString().slice(0, 10);

    const stringValue = String(rawValue).replace(/\s+/g, " ").trim();
    return stringValue.length > 0 ? stringValue : null;
  }

  private resolveCellFromColumns(
    worksheet: XLSX.WorkSheet,
    columnExpression: string,
    rowNumber: number
  ): XLSX.CellObject | undefined {
    const columns = columnExpression.split("|").map((item) => item.trim()).filter(Boolean);
    let fallbackCell: XLSX.CellObject | undefined;

    for (const column of columns) {
      const cell = worksheet[`${column}${rowNumber}`];
      if (!fallbackCell && cell) {
        fallbackCell = cell;
      }

      const displayValue = this.stringifyCellValue(cell);
      if (displayValue !== null) {
        return cell;
      }
    }

    return fallbackCell;
  }

  private normalizeByDataType(
    value: unknown,
    dataType: ReconciliationLayoutMapping["systemDataType"]
  ): SupportedNormalizedValue {
    switch (dataType) {
      case "number":
      case "amount":
        return this.toNumber(value);
      case "date":
        return this.normalizeDateValue(value);
      case "text":
      default:
        return this.normalizeTextValue(value);
    }
  }

  private normalizeTextValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);

    const text = String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    return text.length > 0 ? text : null;
  }

  private normalizeDateValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{5}$/.test(raw)) {
      return this.normalizeDateValue(Number(raw));
    }

    const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
    if (slashMatch) {
      const day = Number(slashMatch[1]);
      const month = Number(slashMatch[2]);
      let year = Number(slashMatch[3]);

      if (year < 100) {
        year += year >= 70 ? 1900 : 2000;
      }

      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const nativeDate = new Date(raw);
    if (!Number.isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString().slice(0, 10);
    }

    return null;
  }

  private toDateDayNumber(value: unknown): number | null {
    const normalized = this.normalizeDateValue(value);
    if (!normalized) return null;

    const timestamp = Date.parse(`${normalized}T00:00:00Z`);
    if (Number.isNaN(timestamp)) return null;

    return Math.floor(timestamp / 86400000);
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value).trim();
    if (!text) return null;

    const cleaned = text
      .replace(/[A-Za-z$%]/g, "")
      .replace(/\s+/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");

    if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) {
      return null;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private buildMetrics(
    totalSystemRows: number,
    totalBankRows: number,
    autoMatches: number,
    manualMatches: number
  ): InternalPreviewMetrics {
    const pairedRows = autoMatches + manualMatches;
    const totalRows = totalSystemRows + totalBankRows;

    return {
      totalSystemRows,
      totalBankRows,
      autoMatches,
      manualMatches,
      unmatchedSystem: Math.max(totalSystemRows - pairedRows, 0),
      unmatchedBank: Math.max(totalBankRows - pairedRows, 0),
      matchPercentage:
        totalRows > 0 ? this.roundNumber(((pairedRows * 2) / totalRows) * 100) : 0
    };
  }

  private resolveReconciliationStatus(
    snapshot: ReconciliationSnapshot,
    comparisonPerformed: boolean
  ): string {
    const hasSystemData = snapshot.metrics.totalSystemRows > 0;
    const hasBankData = snapshot.metrics.totalBankRows > 0;
    const hasMatches = snapshot.metrics.autoMatches + snapshot.metrics.manualMatches > 0;
    const fullyMatched =
      hasSystemData &&
      hasBankData &&
      snapshot.metrics.unmatchedSystem === 0 &&
      snapshot.metrics.unmatchedBank === 0;

    if (hasSystemData && !hasBankData) {
      return "draft_system_only";
    }

    if (!hasSystemData && hasBankData) {
      return "draft_bank_only";
    }

    if (hasSystemData && hasBankData && !comparisonPerformed) {
      return "ready_to_compare";
    }

    if (fullyMatched) {
      return snapshot.metrics.manualMatches > 0 ? "matched_with_manual" : "matched";
    }

    if (comparisonPerformed && hasMatches) {
      return "compared_with_pending";
    }

    if (comparisonPerformed) {
      return "compared_without_matches";
    }

    return "draft";
  }

  private buildRowSignature(
    mappings: ReconciliationLayoutMapping[],
    row: ConciliationPreviewRow
  ): string {
    const orderedKeys = this.sortMappings(mappings)
      .filter((mapping) => mapping.active)
      .map((mapping) => mapping.fieldKey);
    const values = orderedKeys.map((fieldKey) => [fieldKey, row.normalized[fieldKey] ?? null]);
    return JSON.stringify(values);
  }

  private sortPreviewRows(rows: ConciliationPreviewRow[]): ConciliationPreviewRow[] {
    return [...rows].sort((left, right) => {
      if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
      return left.rowId.localeCompare(right.rowId);
    });
  }

  private sortPreviewMatches(matches: ConciliationPreviewMatch[]): ConciliationPreviewMatch[] {
    return [...matches].sort((left, right) => {
      if (left.systemRowNumber !== right.systemRowNumber) {
        return left.systemRowNumber - right.systemRowNumber;
      }
      if (left.bankRowNumber !== right.bankRowNumber) {
        return left.bankRowNumber - right.bankRowNumber;
      }
      const byStatus = left.status.localeCompare(right.status);
      if (byStatus !== 0) return byStatus;
      return `${left.systemRowId}:${left.bankRowId}`.localeCompare(
        `${right.systemRowId}:${right.bankRowId}`
      );
    });
  }

  private toPublicUserBankWithLayouts(entity: BankEntity): PublicUserBankWithLayouts {
    return {
      ...this.toPublicUserBank(entity),
      accounts: [...(entity.accounts ?? [])]
        .sort((left, right) => {
          const byName = left.name.localeCompare(right.name);
          if (byName !== 0) return byName;
          return left.id - right.id;
        })
        .map((account) => this.toPublicCompanyBankAccountSummary(account, entity)),
      layouts: (entity.layouts ?? []).map((layout) => this.toPublicLayout(layout, entity.id))
    };
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
      bank: this.toPublicUserBank(bank),
      layouts: [...(bank.layouts ?? [])]
        .sort((left, right) => {
          const byName = left.name.localeCompare(right.name);
          if (byName !== 0) return byName;
          return left.id - right.id;
        })
        .map((layout) => this.toPublicUserBankDeletionLayout(layout)),
      accounts: accounts.map((account) => this.toPublicUserBankDeletionAccount(account)),
      reconciliationCount: 0,
      bankStatementCount
    };
  }

  private toPublicUserBank(entity: BankEntity): PublicUserBank {
    return {
      ...this.toPublicUserBankSummary(entity),
      userId: entity.user.id,
      userLogin: entity.user.usrLogin
    };
  }

  private toPublicUserBankSummary(entity: BankEntity): PublicUserBankSummary {
    return {
      id: entity.id,
      bankName: entity.bankName,
      alias: entity.alias,
      branch: entity.branch,
      description: entity.description,
      active: entity.active
    };
  }

  private toPublicLayout(
    entity: ReconciliationLayout,
    fallbackUserBankId?: number
  ): PublicLayout {
    const resolvedUserBankId = entity.userBank?.id ?? fallbackUserBankId;
    if (!resolvedUserBankId) {
      throw new BadRequestException("No se pudo resolver el banco asociado de la plantilla.");
    }

    return {
      id: entity.id,
      userBankId: resolvedUserBankId,
      templateLayoutId: entity.templateLayout?.id ?? null,
      systemId: entity.system?.id ?? 0,
      systemName: entity.system?.name ?? entity.systemLabel,
      name: entity.name,
      description: entity.description,
      systemLabel: entity.system?.name ?? entity.systemLabel,
      bankLabel: entity.bankLabel,
      autoMatchThreshold: entity.autoMatchThreshold,
      active: entity.active,
      mappings: this.sortMappings(entity.mappings ?? []).map((mapping) =>
        this.toPublicLayoutMapping(mapping)
      )
    };
  }

  private toPublicTemplateLayout(entity: TemplateLayout): PublicTemplateLayout {
    return {
      id: entity.id,
      systemId: entity.system?.id ?? 0,
      systemName: entity.system?.name ?? entity.systemLabel,
      name: entity.name,
      description: entity.description,
      referenceBankName: entity.referenceBankName,
      systemLabel: entity.system?.name ?? entity.systemLabel,
      bankLabel: entity.bankLabel,
      autoMatchThreshold: entity.autoMatchThreshold,
      active: entity.active,
      mappings: this.sortTemplateMappings(entity.mappings ?? []).map((mapping) =>
        this.toPublicLayoutMapping(mapping)
      )
    };
  }

  private toPublicUserBankDeletionLayout(
    entity: ReconciliationLayout
  ): PublicUserBankDeletionLayout {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      active: entity.active
    };
  }

  private toPublicUserBankDeletionAccount(
    entity: CompanyBankAccount
  ): PublicUserBankDeletionAccount {
    return {
      id: entity.id,
      name: entity.name,
      currency: entity.currency,
      accountNumber: entity.accountNumber,
      bankErpId: entity.bankErpId,
      majorAccountNumber: entity.majorAccountNumber,
      paymentAccountNumber: entity.paymentAccountNumber,
      active: entity.active
    };
  }

  private toPublicLayoutMapping(
    entity: ReconciliationLayoutMapping | TemplateLayoutMapping
  ): PublicLayoutMapping {
    return {
      id: entity.id,
      fieldKey: entity.fieldKey,
      label: entity.label,
      active: entity.active,
      required: entity.required,
      compareOperator: entity.compareOperator as CompareOperator,
      weight: entity.weight,
      tolerance: entity.tolerance,
      sortOrder: entity.sortOrder,
      systemSheet: entity.systemSheet,
      systemColumn: entity.systemColumn,
      systemStartRow: entity.systemStartRow,
      systemEndRow: entity.systemEndRow,
      systemDataType: entity.systemDataType as PublicLayoutMapping["systemDataType"],
      bankSheet: entity.bankSheet,
      bankColumn: entity.bankColumn,
      bankStartRow: entity.bankStartRow,
      bankEndRow: entity.bankEndRow,
      bankDataType: entity.bankDataType as PublicLayoutMapping["bankDataType"]
    };
  }

  private toPublicSystem(entity: ConciliationSystem): PublicConciliationSystem {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      active: entity.active
    };
  }

  private toPublicCompanyBankAccountSummary(
    entity: CompanyBankAccount,
    fallbackBank?: BankEntity
  ): PublicCompanyBankAccountSummary {
    const bank = entity.bank ?? fallbackBank;
    if (!bank) {
      throw new BadRequestException("No se pudo resolver el banco asociado a la cuenta bancaria.");
    }

    return {
      id: entity.id,
      bankId: bank.id,
      bankName: bank.name,
      bankAlias: bank.alias,
      name: entity.name,
      currency: entity.currency,
      accountNumber: entity.accountNumber,
      active: entity.active
    };
  }

  private toPreviewRow(entity: BankStatementRow): ConciliationPreviewRow {
    return {
      rowId: entity.sourceRowId,
      rowNumber: entity.rowNumber,
      values: entity.values ?? {},
      normalized: entity.normalized ?? {}
    };
  }

  private toPublicBankStatementSummary(entity: BankStatement): PublicBankStatementSummary {
    return {
      id: entity.id,
      name: entity.name,
      fileName: entity.fileName,
      status: entity.status,
      rowCount: entity.rowCount,
      userId: entity.user.id,
      userLogin: entity.user.usrLogin,
      userBankId: entity.userBank.id,
      bankName: entity.userBank.bankName,
      bankAlias: entity.userBank.alias,
      companyBankAccountId: entity.companyBankAccount.id,
      companyBankAccountName: entity.companyBankAccount.name,
      companyBankAccountNumber: entity.companyBankAccount.accountNumber,
      companyBankAccountCurrency: entity.companyBankAccount.currency,
      layoutId: entity.layout.id,
      layoutName: entity.layout.name,
      systemId: entity.layout.system?.id ?? 0,
      systemName: entity.layout.system?.name ?? entity.layout.systemLabel,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  private toPublicBankStatementDetail(entity: BankStatement): PublicBankStatementDetail {
    return {
      ...this.toPublicBankStatementSummary(entity),
      userBank: this.toPublicUserBankSummary(entity.userBank),
      companyBankAccount: this.toPublicCompanyBankAccountSummary(entity.companyBankAccount),
      layout: this.toPublicLayout(entity.layout, entity.userBank.id),
      rows: this.sortPreviewRows((entity.rows ?? []).map((row) => this.toPreviewRow(row)))
    };
  }

  private toPublicReconciliationSummary(entity: Reconciliation): PublicReconciliationSummary {
    return {
      id: entity.id,
      name: entity.name,
      status: entity.status,
      updateCount: entity.updateCount ?? 0,
      userId: entity.user.id,
      userLogin: entity.user.usrLogin,
      userBankId: entity.userBank.id,
      bankName: entity.userBank.bankName,
      bankAlias: entity.userBank.alias,
      companyBankAccountId: entity.companyBankAccount?.id ?? null,
      companyBankAccountName: entity.companyBankAccount?.name ?? null,
      companyBankAccountNumber: entity.companyBankAccount?.accountNumber ?? null,
      companyBankAccountCurrency: entity.companyBankAccount?.currency ?? null,
      layoutId: entity.layout.id,
      layoutName: entity.layout.name,
      systemId: entity.layout.system?.id ?? 0,
      systemName: entity.layout.system?.name ?? entity.layout.systemLabel,
      systemFileName: entity.systemFileName,
      bankFileName: entity.bankFileName,
      hasSystemData: entity.hasSystemData ?? false,
      hasBankData: entity.hasBankData ?? false,
      totalSystemRows: entity.totalSystemRows,
      totalBankRows: entity.totalBankRows,
      autoMatches: entity.autoMatches,
      manualMatches: entity.manualMatches,
      unmatchedSystem: entity.unmatchedSystem,
      unmatchedBank: entity.unmatchedBank,
      matchPercentage: entity.matchPercentage,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  private toPublicReconciliationDetail(entity: Reconciliation): PublicReconciliationDetail {
    return {
      ...this.toPublicReconciliationSummary(entity),
      summarySnapshot: entity.summarySnapshot ? this.readSnapshot(entity) : null
    };
  }

  private sortMappings(mappings: ReconciliationLayoutMapping[]): ReconciliationLayoutMapping[] {
    return [...mappings].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.id - right.id;
    });
  }

  private sortTemplateMappings(mappings: TemplateLayoutMapping[]): TemplateLayoutMapping[] {
    return [...mappings].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.id - right.id;
    });
  }

  private normalizeThreshold(value?: number | null): number {
    if (value === null || value === undefined) return 1;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new BadRequestException("autoMatchThreshold debe estar entre 0 y 1.");
    }

    return value;
  }

  private normalizeColumn(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value
      .split("|")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item.length > 0)
      .join("|");

    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptional(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
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

  private ensureMappings(mappings: CreateLayoutDto["mappings"]) {
    if (!Array.isArray(mappings) || mappings.length === 0) {
      throw new BadRequestException("Debes enviar al menos un campo de plantilla.");
    }

    const fieldKeys = new Set<string>();
    for (const mapping of mappings) {
      const normalizedKey = this.normalizeRequired(mapping.fieldKey, "fieldKey");
      if (fieldKeys.has(normalizedKey)) {
        throw new BadRequestException(`El campo ${normalizedKey} esta repetido en la plantilla.`);
      }

      fieldKeys.add(normalizedKey);
    }
  }

  private ensureSuperadmin(actor: AuthUser) {
    if (actor.role !== Role.IS_SUPER_ADMIN) {
      throw new ForbiddenException("Solo el super admin puede administrar bancos y plantillas.");
    }
  }

  private ensureAdminOrSuperadmin(actor: AuthUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.IS_SUPER_ADMIN) {
      throw new ForbiddenException("Solo admin y superadmin pueden ejecutar esta accion.");
    }
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
    return this.toPublicUserBankWithLayouts(bank);
  }

  private roundNumber(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private buildUserFullName(user: User): string | null {
    const parts = [user.usrNombre, user.usrApellido].filter(
      (value): value is string => Boolean(value && value.trim())
    );
    return parts.length > 0 ? parts.join(" ") : null;
  }

  private throwMissingCompanyBankAccountForSnapshot(reconciliationId: number): never {
    throw new BadRequestException(
      `La conciliacion ${reconciliationId} no tiene una cuenta bancaria asociada en el snapshot.`
    );
  }

  private toJsonRecord(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== "object") {
      return { value };
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private formatTodayTag(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private async requireSystem(id: number): Promise<ConciliationSystem> {
    const system = await this.systemRepository.findOne({
      where: { id }
    });

    if (!system) {
      throw new NotFoundException("Sistema no encontrado.");
    }

    return system;
  }

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & {
        driverError?: { code?: string; detail?: string; constraint?: string };
      }).driverError;

      if (driverError?.code === "23505") {
        const detail = String(driverError.detail ?? "").toLowerCase();
        const constraint = String(driverError.constraint ?? "").toLowerCase();

        if (detail.includes("banco_") || constraint.includes("bancos")) {
          throw new ConflictException("Ya existe una asignacion de banco con esos datos.");
        }

        if (detail.includes("mapeo_clave_campo") || constraint.includes("plantillas_conciliacion_mapeos")) {
          throw new ConflictException("La plantilla no puede repetir fieldKey.");
        }

        if (detail.includes("mapeo_base_clave_campo") || constraint.includes("plantillas_base_mapeos")) {
          throw new ConflictException("La plantilla base no puede repetir fieldKey.");
        }

        if (constraint.includes("uq_plantillas_base_nombre")) {
          throw new ConflictException("Ya existe una plantilla base con ese nombre.");
        }

        if (constraint.includes("uq_sistemas_nombre")) {
          throw new ConflictException("Ya existe un sistema con ese nombre.");
        }

        if (constraint.includes("uq_plantillas_conciliacion_activa")) {
          throw new ConflictException("Solo puede haber una plantilla activa por banco.");
        }

        throw new ConflictException("Ya existe un registro con esos datos unicos.");
      }
    }

    throw error;
  }
}
