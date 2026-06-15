import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  EntityManager,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder
} from "typeorm";
import { CompanyErpConfig } from "../erp/entities/company-erp-config.entity";
import { ExternalRequestError, SapB1Service, SapBankPagePayload } from "../erp/sap/sap-b1.service";
import { ensureSapErpType, validateSapConfig } from "../erp/sap/sap-config.validator";
import { Role } from "../common/enums/role.enum";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { decryptText } from "../common/utils/encryption.util";
import { isGestorRole } from "../common/utils/role.util";
import { User } from "../users/entities/user.entity";
import { ApplyTemplateLayoutDto } from "./dto/apply-template-layout.dto";
import { AssignGestorBankDto } from "./dto/assign-gestor-bank.dto";
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto";
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto";
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateLayoutDto } from "./dto/create-layout.dto";
import { CreateTemplateLayoutDto } from "./dto/create-template-layout.dto";
import { CompanyBankAccount } from "./entities/company-bank-account.entity";
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto";
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
  ConciliationPreviewRow,
  ConciliationKpiResponse,
  ConciliationPreviewResponse,
  DeleteUserBankResponse,
  PublicBankStatementDetail,
  PublicBankStatementSummary,
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

type SapB1BankStatementConfigStatus = {
  enabled: boolean;
  companyErpConfigId: number | null;
  companyErpConfigName: string | null;
  code: string | null;
};

type SapBankPageRowResult = {
  rowId: string;
  rowNumber: number;
  sequence: number | null;
  httpStatus: number;
  responsePayload: Record<string, unknown> | null;
  payload: SapBankPagePayload;
};

type SapBankPageProcessResponse = PublicBankStatementDetail & {
  sap: {
    companyErpConfigId: number;
    companyErpConfigName: string;
    endpoint: string;
    processedRows: number;
    sequences: Array<{
      rowId: string;
      rowNumber: number;
      sequence: number | null;
    }>;
  };
};

type PreparedSapBankPageRow = {
  source: ConciliationPreviewRow;
  payload: SapBankPagePayload;
};

@Injectable()
export class ConciliationService {
  private readonly logger = new Logger(ConciliationService.name);
  private readonly credentialSecret: string;

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
    @InjectRepository(TemplateLayout)
    private readonly templateLayoutRepository: Repository<TemplateLayout>,
    @InjectRepository(TemplateLayoutMapping)
    private readonly templateLayoutMappingRepository: Repository<TemplateLayoutMapping>,
    @InjectRepository(UserTemplateAvailability)
    private readonly userTemplateAvailabilityRepository: Repository<UserTemplateAvailability>,
    @InjectRepository(ReconciliationLayout)
    private readonly layoutRepository: Repository<ReconciliationLayout>,
    @InjectRepository(ReconciliationLayoutMapping)
    private readonly layoutMappingRepository: Repository<ReconciliationLayoutMapping>,
    @InjectRepository(CompanyErpConfig)
    private readonly companyErpConfigRepository: Repository<CompanyErpConfig>,
    configService: ConfigService,
    private readonly sapB1Service: SapB1Service
  ) {
    this.credentialSecret =
      configService.get<string>("ERP_CREDENTIAL_SECRET")?.trim() ||
      configService.get<string>("JWT_SECRET", "CHANGE_THIS_FOR_A_LONG_RANDOM_SECRET");
  }

  async listCatalog(actor: AuthUser, requestedUserId?: number): Promise<PublicUserBankWithLayouts[]> {
    const scope = await this.resolveAccessibleConfigurationScope(actor, requestedUserId);

    // 1) Bancos basicos + usuario (sin colecciones para evitar producto cartesiano)
    const banksQuery = this.userBankRepository
      .createQueryBuilder("userBank")
      .leftJoinAndSelect("userBank.user", "user")
      .leftJoinAndSelect("userBank.company", "bankCompany")
      .andWhere("userBank.banco_origen_id IS NULL");

    this.applyUserScopeToQuery(banksQuery, scope, "user", "bankCompany");
    const banks = await banksQuery
      .select([
        "userBank.id",
        "userBank.name",
        "userBank.description",
        "userBank.branch",
        "userBank.active",
        "user.id",
        "user.usrLogin",
        "bankCompany.id",
        "bankCompany.name"
      ])
      .orderBy("user.usrLogin", "ASC")
      .addOrderBy("userBank.name", "ASC")
      .addOrderBy("userBank.id", "ASC")
      .getMany();

    if (banks.length === 0) return [];

    const bankIds = banks.map((b) => b.id);
    const companyIds = Array.from(
      new Set(banks.map((b) => b.company?.id).filter((id): id is number => Boolean(id)))
    );

    // 2) Cuentas de esos bancos (query separada)
    const accounts = await this.companyBankAccountRepository
      .createQueryBuilder("account")
      .leftJoinAndSelect("account.bank", "bank")
      .where("bank.id IN (:...bankIds)", { bankIds })
      .andWhere("account.cuenta_bancaria_origen_id IS NULL")
      .select(["account.id", "account.name", "account.accountNumber", "account.currency", "account.active", "bank.id"])
      .orderBy("account.name", "ASC")
      .addOrderBy("account.id", "ASC")
      .getMany();

    // 3) Layouts de esos bancos + system + mappings (query separada)
    const layouts = await this.layoutRepository
      .createQueryBuilder("layout")
      .leftJoinAndSelect("layout.userBank", "layoutBank")
      .leftJoinAndSelect("layout.mappings", "mapping")
      .leftJoinAndSelect("layout.templateLayout", "templateLayout")
      .where("layoutBank.id IN (:...bankIds)")
      .setParameter("bankIds", bankIds)
      .select([
        "layout.id", "layout.name", "layout.description", "layout.systemLabel", "layout.bankLabel",
        "layout.autoMatchThreshold", "layout.active",
        "layoutBank.id",
        "templateLayout.id",
        "mapping.id", "mapping.fieldKey", "mapping.label", "mapping.sortOrder", "mapping.active",
        "mapping.required", "mapping.compareOperator", "mapping.weight", "mapping.tolerance",
        "mapping.systemSheet", "mapping.systemColumn", "mapping.systemStartRow", "mapping.systemEndRow",
        "mapping.systemDataType", "mapping.bankSheet", "mapping.bankColumn", "mapping.bankStartRow",
        "mapping.bankEndRow", "mapping.bankDataType"
      ])
      .orderBy("layout.name", "ASC")
      .addOrderBy("layout.id", "ASC")
      .addOrderBy("mapping.sortOrder", "ASC")
      .getMany();

    // 4) Disponibilidades de templates por empresa
    const availabilityByCompany = await this.loadAvailabilityIdsByCompany(companyIds);

    // Ensamblar estructura
    const accountsByBank = new Map<number, CompanyBankAccount[]>();
    for (const account of accounts) {
      const list = accountsByBank.get(account.bank.id) ?? [];
      list.push(account);
      accountsByBank.set(account.bank.id, list);
    }

    const layoutsByBank = new Map<number, ReconciliationLayout[]>();
    for (const layout of layouts) {
      const bankId = layout.userBank.id;
      const list = layoutsByBank.get(bankId) ?? [];
      list.push(layout);
      layoutsByBank.set(bankId, list);
    }

    return banks.map((bank) => {
      bank.accounts = accountsByBank.get(bank.id) ?? [];
      bank.layouts = layoutsByBank.get(bank.id) ?? [];
      return toPublicUserBankWithLayouts(
        bank,
        availabilityByCompany.get(bank.company?.id ?? 0) ?? []
      );
    });
  }

  private async loadAvailabilityIdsByCompany(
    companyIds: number[]
  ): Promise<Map<number, number[]>> {
    const result = new Map<number, number[]>();
    const uniqueCompanyIds = Array.from(new Set(companyIds.filter((id) => id > 0)));
    if (uniqueCompanyIds.length === 0) return result;

    const rows = await this.userTemplateAvailabilityRepository
      .createQueryBuilder("availability")
      .leftJoin("availability.user", "user")
      .leftJoin("user.company", "company")
      .leftJoin("availability.templateLayout", "templateLayout")
      .where("company.id IN (:...companyIds)", { companyIds: uniqueCompanyIds })
      .select("company.id", "companyId")
      .addSelect("templateLayout.id", "templateId")
      .getRawMany<{ companyId: string | number; templateId: string | number }>();

    for (const row of rows) {
      const companyId = Number(row.companyId);
      const templateId = Number(row.templateId);
      if (!companyId || !templateId) continue;

      const list = result.get(companyId) ?? [];
      if (!list.includes(templateId)) {
        list.push(templateId);
      }
      result.set(companyId, list);
    }

    return result;
  }

  private async loadAvailabilityTemplatesByCompany(
    companyIds: number[]
  ): Promise<Map<number, TemplateLayout[]>> {
    const result = new Map<number, Map<number, TemplateLayout>>();
    const uniqueCompanyIds = Array.from(new Set(companyIds.filter((id) => id > 0)));
    if (uniqueCompanyIds.length === 0) return new Map();

    const rows = await this.userTemplateAvailabilityRepository
      .createQueryBuilder("availability")
      .leftJoinAndSelect("availability.user", "user")
      .leftJoinAndSelect("user.company", "company")
      .leftJoinAndSelect("availability.templateLayout", "templateLayout")
      .leftJoinAndSelect("templateLayout.mappings", "templateMapping")
      .where("company.id IN (:...companyIds)", { companyIds: uniqueCompanyIds })
      .getMany();

    for (const row of rows) {
      const companyId = row.user?.company?.id;
      const template = row.templateLayout;
      if (!companyId || !template) continue;

      const templateById = result.get(companyId) ?? new Map<number, TemplateLayout>();
      templateById.set(template.id, template);
      result.set(companyId, templateById);
    }

    return new Map(
      [...result.entries()].map(([companyId, templateById]) => [
        companyId,
        [...templateById.values()].sort((left, right) => left.name.localeCompare(right.name))
      ])
    );
  }

  async listTemplateLayouts(actor: AuthUser): Promise<PublicTemplateLayout[]> {
    ensureSuperadmin(actor);

    const templates = await this.templateLayoutRepository.find({
      relations: {
        mappings: true
      },
      order: {
        id: "ASC"
      }
    });

    return templates.map((template) => toPublicTemplateLayout(template));
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

      const template = await templateRepository.save(
        templateRepository.create({
          name: normalizeRequired(payload.name, "name"),
          description: normalizeOptional(payload.description),
          referenceBankName: normalizeOptional(payload.referenceBankName),
          systemLabel: normalizeRequired(payload.systemLabel ?? "Sistema", "systemLabel"),
          bankLabel: normalizeRequired(payload.bankLabel ?? "Banco", "bankLabel"),
          autoMatchThreshold: normalizeThreshold(payload.autoMatchThreshold),
          amountMode: payload.amountMode ?? null,
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

      const template = await templateRepository.findOne({
        where: { id: templateLayoutId },
        relations: {
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
      if (payload.systemLabel !== undefined) {
        template.systemLabel = normalizeRequired(payload.systemLabel, "systemLabel");
      }
      if (payload.bankLabel !== undefined) {
        template.bankLabel = normalizeRequired(payload.bankLabel, "bankLabel");
      }
      if (payload.autoMatchThreshold !== undefined) {
        template.autoMatchThreshold = normalizeThreshold(payload.autoMatchThreshold);
      }
      if (payload.amountMode !== undefined) template.amountMode = payload.amountMode;
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

      const userBank = await bankRepository.findOne({
        where: { id: bankId, user: { id: userId } },
        relations: { layouts: true, user: true }
      });

      if (!userBank) {
        throw new NotFoundException("Banco asignado no encontrado.");
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
          name: normalizeRequired(payload.name, "name"),
          description: normalizeOptional(payload.description),
          systemLabel: normalizeRequired(payload.systemLabel ?? "Sistema", "systemLabel"),
          bankLabel: normalizeRequired(payload.bankLabel ?? userBank.bankName, "bankLabel"),
          autoMatchThreshold: normalizeThreshold(payload.autoMatchThreshold),
          amountMode: payload.amountMode ?? null,
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
          templateLayout: template,
          name: normalizeRequired(payload.name ?? template.name, "name"),
          description: normalizeOptional(payload.description ?? template.description),
          systemLabel: normalizeRequired(payload.systemLabel ?? template.systemLabel, "systemLabel"),
          bankLabel: normalizeRequired(
            payload.bankLabel ?? userBank.bankName ?? template.bankLabel,
            "bankLabel"
          ),
          autoMatchThreshold: normalizeThreshold(
            payload.autoMatchThreshold ?? template.autoMatchThreshold
          ),
          amountMode: payload.amountMode ?? template.amountMode ?? null,
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

    const companyUsers = await this.userRepository.find({
      where: {
        company: {
          id: user.company.id
        }
      },
      relations: {
        company: true
      }
    });
    const companyUserIds = Array.from(new Set(companyUsers.map((item) => item.id)));

    await this.userTemplateAvailabilityRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(UserTemplateAvailability);

      if (companyUserIds.length > 0) {
        await repo
          .createQueryBuilder()
          .delete()
          .from(UserTemplateAvailability)
          .where("usuario_id IN (:...companyUserIds)", { companyUserIds })
          .execute();
      }

      if (ids.length > 0 && companyUsers.length > 0) {
        await repo.save(
          companyUsers.flatMap((companyUser) =>
            ids.map((templateId) =>
              repo.create({
                user: companyUser,
                templateLayout: { id: templateId } as TemplateLayout
              })
            )
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
      .leftJoinAndSelect("userBank.company", "bankCompany")
      .leftJoinAndSelect("userBank.layouts", "layout")
      .leftJoinAndSelect("layout.mappings", "mapping")
      .leftJoinAndSelect("layout.templateLayout", "layoutTemplate");

    queryBuilder.andWhere("userBank.banco_origen_id IS NULL");

    if (actor.role === Role.ADMIN) {
      queryBuilder.andWhere("bankCompany.id = :companyId", { companyId: actor.companyId });
    }

    const banks = await queryBuilder.getMany();

    if (banks.length === 0) return [];

    const companyIds = Array.from(
      new Set(banks.map((bank) => bank.company?.id).filter((id): id is number => Boolean(id)))
    );
    const availabilityByCompany = await this.loadAvailabilityTemplatesByCompany(companyIds);

    return banks
      .sort((left, right) => {
        const byCompany = (left.company?.name ?? left.user.company?.name ?? "").localeCompare(
          right.company?.name ?? right.user.company?.name ?? ""
        );
        if (byCompany !== 0) return byCompany;
        const byUser = left.user.usrLogin.localeCompare(right.user.usrLogin);
        if (byUser !== 0) return byUser;
        const byBank = left.bankName.localeCompare(right.bankName);
        if (byBank !== 0) return byBank;
        return left.id - right.id;
      })
      .map((bank) => {
        const templates = availabilityByCompany.get(bank.company?.id ?? 0) ?? [];
        return {
          ...toPublicUserBank(bank),
          companyId: bank.company?.id ?? bank.user.company?.id ?? 0,
          companyName: bank.company?.name ?? bank.user.company?.name ?? "",
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
        company: true,
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
      bank.company.id !== actor.companyId
    ) {
      throw new ForbiddenException(
        "No podes aplicar plantillas a bancos de otra empresa."
      );
    }

    const availabilityByCompany = await this.loadAvailabilityIdsByCompany([bank.company.id]);
    const availableTemplateIds = availabilityByCompany.get(bank.company.id) ?? [];

    if (!availableTemplateIds.includes(templateLayoutId)) {
      throw new ForbiddenException(
        "La plantilla base no esta habilitada para esta empresa. Pedile al super admin que la habilite."
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
          templateLayout: template,
          name: normalizeRequired(payload.name ?? template.name, "name"),
          description: normalizeOptional(payload.description ?? template.description),
          systemLabel: normalizeRequired(payload.systemLabel ?? template.systemLabel, "systemLabel"),
          bankLabel: normalizeRequired(
            payload.bankLabel ?? userBank.bankName ?? template.bankLabel,
            "bankLabel"
          ),
          autoMatchThreshold: normalizeThreshold(
            payload.autoMatchThreshold ?? template.autoMatchThreshold
          ),
          amountMode: payload.amountMode ?? template.amountMode ?? null,
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
        company: true,
        user: { company: true },
        layouts: true
      }
    });

    if (!bank) {
      throw new NotFoundException("Banco asignado no encontrado.");
    }

    if (
      actor.role === Role.ADMIN &&
      bank.company.id !== actor.companyId
    ) {
      throw new ForbiddenException(
        "No podes activar plantillas en bancos de otra empresa."
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

      const layout = await layoutRepository.findOne({
        where: { id: layoutId, userBank: { id: bankId, user: { id: userId } } },
        relations: {
          userBank: {
            user: true
          },
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
      if (payload.systemLabel !== undefined) {
        layout.systemLabel = normalizeRequired(payload.systemLabel, "systemLabel");
      }
      if (payload.bankLabel !== undefined) {
        layout.bankLabel = normalizeRequired(payload.bankLabel, "bankLabel");
      }
      if (payload.autoMatchThreshold !== undefined) {
        layout.autoMatchThreshold = normalizeThreshold(payload.autoMatchThreshold);
      }
      if (payload.amountMode !== undefined) layout.amountMode = payload.amountMode;
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
    const filteredRows = this.excludeBankStatementRows(rows, payload.excludedRowIds);

    return {
      userBank: toPublicUserBankSummary(userBank),
      companyBankAccount: toPublicCompanyBankAccountSummary(companyBankAccount),
      layout: toPublicLayout(layout),
      fileName: file.originalname,
      rowCount: filteredRows.length,
      rows: filteredRows
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
    const filteredRows = this.excludeBankStatementRows(rows, payload.excludedRowIds);

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
          rowCount: filteredRows.length,
          metadata: toJsonRecord({
            source: "bank_excel",
            uploadedByUserId: actor.id,
            excludedRowIds: payload.excludedRowIds ?? []
          })
        })
      );

      if (filteredRows.length > 0) {
        await rowRepository.save(
          filteredRows.map((row) =>
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

  async getSapB1BankStatementConfigStatus(
    actor: AuthUser,
    requestedUserId?: number
  ): Promise<SapB1BankStatementConfigStatus> {
    const companyId = await this.resolveCompanyIdForSapB1Status(actor, requestedUserId);
    const config = await this.findActiveSapB1Config(companyId);

    return {
      enabled: Boolean(config),
      companyErpConfigId: config?.id ?? null,
      companyErpConfigName: config?.name ?? null,
      code: config?.code ?? null
    };
  }

  async processBankStatementWithSapB1(
    actor: AuthUser,
    payload: CreateBankStatementDto,
    file?: UploadedMemoryFile
  ): Promise<SapBankPageProcessResponse> {
    if (!file?.buffer) {
      throw new BadRequestException("Debes subir el Excel del extracto bancario.");
    }

    const { userBank, layout, companyBankAccount } = await this.requireAccessibleLayoutAndAccount(
      actor,
      payload.userBankId,
      payload.layoutId,
      payload.companyBankAccountId
    );
    const accountCode = normalizeRequired(
      companyBankAccount.majorAccountNumber,
      "cuenta_bancaria_numero_mayor"
    );
    const config = await this.findActiveSapB1Config(companyBankAccount.company.id);

    if (!config) {
      throw new BadRequestException(
        "La empresa no tiene una configuracion ERP activa con codigo SAP_B1."
      );
    }

    ensureSapErpType(config.erpType);
    validateSapConfig(config, false);

    const rows = extractRowsFromWorkbook(
      readWorkbook(file.buffer, file.originalname),
      layout.mappings,
      "bank"
    );
    const filteredRows = this.excludeBankStatementRows(rows, payload.excludedRowIds);
    const preparedRows = this.buildSapBankPageRows(
      filteredRows,
      accountCode,
      layout.amountMode ?? null
    );
    const endpointPath = this.getConfigString(config, [
      "sapBankPagesEndpoint",
      "bankPagesEndpoint"
    ]) ?? "BankPages";
    const endpoint = this.sapB1Service.joinUrl(config.serviceLayerUrl, endpointPath);
    const credentials = this.resolveSapSystemCredentials(config);
    const sapResults: SapBankPageRowResult[] = [];

    // [DEBUG] Payload completo que se envia a SAP (BankPages / Service Layer).
    // Una linea por fila con AccountCode/DueDate/DebitAmount/CreditAmount, etc.
    console.log(
      "[SAP_B1][BankPages][REQUEST]",
      JSON.stringify(
        {
          endpoint,
          accountCode,
          amountMode: layout.amountMode ?? null,
          rowCount: preparedRows.length,
          payloads: preparedRows.map((preparedRow) => ({
            rowNumber: preparedRow.source.rowNumber,
            payload: preparedRow.payload
          }))
        },
        null,
        2
      )
    );

    try {
      const login = await this.sapB1Service.login(config, credentials);

      for (const preparedRow of preparedRows) {
        try {
          const sapResponse = await this.sapB1Service.createBankPage(
            config,
            login.cookieHeader,
            preparedRow.payload,
            endpointPath
          );
          console.log("[SAP_B1][BankPages][RESPONSE]", {
            rowNumber: preparedRow.source.rowNumber,
            statusCode: sapResponse.statusCode,
            sequence: this.extractSapSequence(sapResponse.bodyJson)
          });
          sapResults.push({
            rowId: preparedRow.source.rowId,
            rowNumber: preparedRow.source.rowNumber,
            sequence: this.extractSapSequence(sapResponse.bodyJson),
            httpStatus: sapResponse.statusCode,
            responsePayload: sapResponse.bodyJson,
            payload: preparedRow.payload
          });
        } catch (error) {
          throw this.mapSapBankPageError(error, preparedRow.source.rowNumber, sapResults.length);
        }
      }
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }

      throw this.mapSapConnectionError(error);
    }

    const detail = await this.bankStatementRepository.manager.transaction(async (manager) => {
      const statementRepository = manager.getRepository(BankStatement);
      const rowRepository = manager.getRepository(BankStatementRow);
      const userRepository = manager.getRepository(User);

      const persistedActor = await userRepository.findOne({ where: { id: actor.id } });
      if (!persistedActor) {
        throw new NotFoundException("Usuario ejecutor no encontrado.");
      }

      const resultByRowId = new Map(sapResults.map((result) => [result.rowId, result]));
      const statement = await statementRepository.save(
        statementRepository.create({
          user: persistedActor,
          userBank,
          companyBankAccount,
          layout,
          name: normalizeRequired(payload.name, "name"),
          fileName: file.originalname,
          status: "sap_b1_processed",
          rowCount: filteredRows.length,
          metadata: toJsonRecord({
            source: "bank_excel",
            uploadedByUserId: actor.id,
            excludedRowIds: payload.excludedRowIds ?? [],
            processedWith: "sap_b1_bank_pages",
            sap: {
              companyErpConfigId: config.id,
              companyErpConfigName: config.name,
              endpoint,
              processedRows: sapResults.length,
              sequences: sapResults.map((result) => ({
                rowId: result.rowId,
                rowNumber: result.rowNumber,
                sequence: result.sequence
              }))
            }
          })
        })
      );

      if (filteredRows.length > 0) {
        await rowRepository.save(
          filteredRows.map((row) => {
            const result = resultByRowId.get(row.rowId);
            const sequence = result?.sequence ?? null;
            const sentPayload = result?.payload ?? null;

            return rowRepository.create({
              statement,
              sourceRowId: row.rowId,
              rowNumber: row.rowNumber,
              values: {
                ...row.values,
                AccountCode: accountCode,
                Sequence: sequence === null ? null : String(sequence)
              },
              normalized: {
                ...row.normalized,
                AccountCode: accountCode,
                accountCode,
                BankStatementAccountCode: accountCode,
                bankStatementAccountCode: accountCode,
                Sequence: sequence,
                sequence,
                BankStatementLineSequence: sequence,
                bankStatementLineSequence: sequence,
                DueDate: sentPayload?.DueDate ?? null,
                Reference: sentPayload?.Reference ?? null,
                Memo: sentPayload?.Memo ?? null,
                DebitAmount: sentPayload?.DebitAmount ?? null,
                CreditAmount: sentPayload?.CreditAmount ?? null
              }
            });
          })
        );
      }

      return this.requirePersistedBankStatement(
        manager,
        statement.id,
        "No se pudo recuperar el extracto bancario procesado."
      );
    });

    return {
      ...detail,
      sap: {
        companyErpConfigId: config.id,
        companyErpConfigName: config.name,
        endpoint,
        processedRows: sapResults.length,
        sequences: sapResults.map((result) => ({
          rowId: result.rowId,
          rowNumber: result.rowNumber,
          sequence: result.sequence
        }))
      }
    };
  }

  async listBankStatements(
    actor: AuthUser,
    query: ListBankStatementsQueryDto
  ): Promise<PaginatedResponse<PublicBankStatementSummary>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    // Cap del limite para evitar payloads enormes accidentales.
    const requestedLimit = query.limit && query.limit > 0 ? query.limit : 10;
    const limit = Math.min(requestedLimit, 100);
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
    const statement = await this.bankStatementRepository.findOne({
      where: { id: statementId },
      relations: {
        user: {
          company: true
        },
        companyBankAccount: {
          company: true
        },
        rows: true
      }
    });

    if (!statement) {
      throw new NotFoundException("Extracto bancario no encontrado.");
    }

    ensureActorCanAccessTargetUser(actor, statement.user);

    if (this.isSapB1ProcessedBankStatement(statement)) {
      await this.deleteSapB1BankStatementRows(statement);
    }

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

    // Construye una sola vez el query con scope/filtros y reutiliza el clone()
    // para sumar agregados sin volver a calcular permisos.
    const baseQuery = await this.buildBankStatementQuery(actor, query);

    // Agregados en una sola query (sin traer filas a memoria).
    // Se quita el ORDER BY heredado porque las funciones agregadas no lo permiten en PG.
    const aggregateRow = await baseQuery
      .clone()
      .orderBy("")
      .select("COUNT(statement.id)", "totalReconciliations")
      .addSelect("COALESCE(SUM(statement.rowCount), 0)", "totalUnmatchedBank")
      .getRawOne<{ totalReconciliations: string; totalUnmatchedBank: string }>();

    const totalReconciliations = Number(aggregateRow?.totalReconciliations ?? 0);
    const totalUnmatchedBank = Number(aggregateRow?.totalUnmatchedBank ?? 0);

    // Breakdown por banco con un GROUP BY (sin cargar entidades completas).
    const breakdownRows = await baseQuery
      .clone()
      .orderBy("")
      .select("userBank.id", "userBankId")
      .addSelect("userBank.name", "bankName")
      .addSelect("COUNT(statement.id)", "totalReconciliations")
      .groupBy("userBank.id")
      .addGroupBy("userBank.name")
      .orderBy("COUNT(statement.id)", "DESC")
      .getRawMany<{ userBankId: number; bankName: string; totalReconciliations: string }>();

    // Solo se traen las 12 ultimas filas con sus relaciones, no todas.
    const recent = await baseQuery
      .clone()
      .take(12)
      .getMany();

    return {
      totalReconciliations,
      totalAutoMatches: 0,
      totalManualMatches: 0,
      totalUnmatchedSystem: 0,
      totalUnmatchedBank,
      averageMatchPercentage: 0,
      bankBreakdown: breakdownRows.map((row) => ({
        userBankId: Number(row.userBankId),
        bankName: row.bankName,
        totalReconciliations: Number(row.totalReconciliations),
        averageMatchPercentage: 0
      })),
      recentReconciliations: recent.map((item) => ({
        id: item.id,
        name: item.name,
        bankName: item.userBank.bankName,
        companyBankAccountName: item.companyBankAccount?.name ?? null,
        companyBankAccountNumber: item.companyBankAccount?.accountNumber ?? null,
        layoutName: item.layout.name,
        systemName: item.layout.systemLabel,
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
          templateLayout: true,
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
      targetBankName: sourceBank.name,
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
      const term = query.search.trim();
      if (term.length > 0) {
        queryBuilder.andWhere(
          "(statement.name ILIKE :search OR statement.fileName ILIKE :search OR userBank.bankName ILIKE :search OR companyBankAccount.name ILIKE :search OR companyBankAccount.accountNumber ILIKE :search OR layout.name ILIKE :search)",
          { search: `%${term}%` }
        );
      }
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
              mappings: true
            }
          })
        : null;

      if (!targetLayout) {
        targetLayout = await layoutRepository.findOne({
          where: {
            userBank: { id: targetBank.id },
            name: hydratedSourceLayout.name
          },
          relations: {
            userBank: true,
            templateLayout: true,
            mappings: true
          }
        });
      }

      if (!targetLayout) {
        targetLayout = layoutRepository.create({
          userBank: targetBank,
          templateLayout: hydratedSourceLayout.templateLayout,
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

  private async resolveCompanyIdForSapB1Status(
    actor: AuthUser,
    requestedUserId?: number
  ): Promise<number> {
    const scope = await this.resolveAccessibleConfigurationScope(actor, requestedUserId);

    if (scope.companyId) {
      return scope.companyId;
    }

    if (scope.userId) {
      const targetUser = await this.requireUser(scope.userId);
      return targetUser.company.id;
    }

    if (actor.companyId) {
      return actor.companyId;
    }

    throw new BadRequestException("No se pudo resolver la empresa para consultar SAP_B1.");
  }

  private async findActiveSapB1Config(companyId: number): Promise<CompanyErpConfig | null> {
    return this.companyErpConfigRepository
      .createQueryBuilder("config")
      .leftJoinAndSelect("config.company", "company")
      .where("company.id = :companyId", { companyId })
      .andWhere("config.active = :active", { active: true })
      .andWhere("LOWER(config.code) = LOWER(:code)", { code: "SAP_B1" })
      .orderBy("config.isDefault", "DESC")
      .addOrderBy("config.id", "ASC")
      .getOne();
  }

  private resolveSapSystemCredentials(
    config: CompanyErpConfig
  ): { username: string; password: string } {
    const username = this.normalizeUnknownText(config.userSystem);

    if (!username) {
      throw new BadRequestException("La configuracion SAP_B1 no tiene epc_user_system.");
    }

    if (!config.userPassEncrypted) {
      throw new BadRequestException("La configuracion SAP_B1 no tiene epc_user_pass.");
    }

    try {
      const password = decryptText(config.userPassEncrypted, this.credentialSecret);
      if (!password.trim()) {
        throw new BadRequestException("La configuracion SAP_B1 no tiene epc_user_pass.");
      }

      return { username, password };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException("No se pudo descifrar epc_user_pass de SAP_B1.");
    }
  }

  private buildSapBankPageRows(
    rows: ConciliationPreviewRow[],
    accountCode: string,
    amountMode: string | null
  ): PreparedSapBankPageRow[] {
    if (rows.length === 0) {
      throw new BadRequestException("El Excel no tiene filas bancarias para procesar.");
    }

    const seen = new Set<string>();

    return rows.map((row, index) => {
      const rowLabel = row.rowNumber || index + 1;
      const dueDate = this.normalizeSapDate(
        this.readPreviewRowString(row, [
          "DueDate",
          "dueDate",
          "fecha",
          "fechaMovimiento",
          "fechaContable",
          "fechaContabilizacion",
          "date"
        ])
      );
      if (!dueDate) {
        throw new BadRequestException(`No se encontro Fecha valida para la fila ${rowLabel}.`);
      }

      const memo =
        this.readPreviewRowString(row, [
          "Memo",
          "memo",
          "descripcion",
          "description",
          "concepto",
          "detalle"
        ]) ?? "";
      const reference =
        this.readPreviewRowString(row, [
          "Reference",
          "reference",
          "movimiento",
          "referencia",
          "ref1",
          "ref",
          "numeroMovimiento",
          "nroMovimiento"
        ]) ?? String(rowLabel);
      const { debitAmount, creditAmount } = this.resolveBankPageAmounts(
        row,
        rowLabel,
        amountMode
      );

      const payload = {
        AccountCode: accountCode,
        DueDate: dueDate,
        Memo: memo,
        Reference: reference,
        DebitAmount: debitAmount,
        CreditAmount: creditAmount
      };
      const duplicateKey = [
        payload.AccountCode,
        payload.DueDate,
        payload.Reference,
        payload.DebitAmount,
        payload.CreditAmount
      ].join("|");

      if (seen.has(duplicateKey)) {
        throw new BadRequestException(
          `El Excel tiene una fila duplicada para AccountCode + Fecha + Referencia + Importe en la fila ${rowLabel}.`
        );
      }
      seen.add(duplicateKey);

      return {
        source: row,
        payload
      };
    });
  }

  // Resuelve DebitAmount/CreditAmount de una fila del extracto segun el modo de
  // importe de la plantilla. amountMode null => autodeteccion (compat).
  private resolveBankPageAmounts(
    row: ConciliationPreviewRow,
    rowLabel: number,
    amountMode: string | null
  ): { debitAmount: number; creditAmount: number } {
    const creditKeys = [
      "CreditAmount",
      "creditAmount",
      "creditos",
      "credito",
      "haber",
      "acreditacion",
      "montoCredito"
    ];
    const debitKeys = [
      "DebitAmount",
      "debitAmount",
      "debitos",
      "debito",
      "debe",
      "montoDebito"
    ];
    const singleKeys = ["monto", "importe", "amount"];

    const explicitCredit = this.readPreviewRowAmount(row, creditKeys);
    const explicitDebit = this.readPreviewRowAmount(row, debitKeys);
    const singleAmount = this.readPreviewRowAmount(row, singleKeys);

    let creditAmount = 0;
    let debitAmount = 0;

    switch (amountMode) {
      case "debit_credit": {
        if (explicitCredit === null && explicitDebit === null) {
          throw new BadRequestException(
            `La fila ${rowLabel} no tiene Debito ni Credito mapeados.`
          );
        }
        creditAmount = explicitCredit ?? 0;
        debitAmount = explicitDebit ?? 0;
        break;
      }
      case "signed": {
        // Importe unico con signo (+ credito / - debito). Si no hay columna
        // unica pero si DEBE/HABER, derivar el neto = credito - debito.
        const amount =
          singleAmount ??
          (explicitCredit !== null || explicitDebit !== null
            ? (explicitCredit ?? 0) - (explicitDebit ?? 0)
            : null);
        if (amount === null) {
          throw new BadRequestException(
            `No se encontro Importe para la fila ${rowLabel}.`
          );
        }
        if (amount >= 0) {
          creditAmount = amount;
        } else {
          debitAmount = Math.abs(amount);
        }
        break;
      }
      case "single_credit": {
        const amount = singleAmount ?? explicitCredit ?? explicitDebit;
        if (amount === null) {
          throw new BadRequestException(
            `No se encontro Importe (Credito) para la fila ${rowLabel}.`
          );
        }
        creditAmount = Math.abs(amount);
        break;
      }
      case "single_debit": {
        const amount = singleAmount ?? explicitDebit ?? explicitCredit;
        if (amount === null) {
          throw new BadRequestException(
            `No se encontro Importe (Debito) para la fila ${rowLabel}.`
          );
        }
        debitAmount = Math.abs(amount);
        break;
      }
      default: {
        // Autodeteccion: columnas separadas si existen, si no signo del monto.
        if (explicitCredit !== null || explicitDebit !== null) {
          creditAmount = explicitCredit ?? 0;
          debitAmount = explicitDebit ?? 0;
        } else if (singleAmount !== null) {
          if (singleAmount >= 0) {
            creditAmount = singleAmount;
          } else {
            debitAmount = Math.abs(singleAmount);
          }
        } else {
          throw new BadRequestException(
            `No se encontro Creditos, Debitos o Importe para la fila ${rowLabel}.`
          );
        }
      }
    }

    // Un credito negativo es en realidad un debito (y viceversa).
    if (creditAmount < 0) {
      debitAmount = debitAmount > 0 ? debitAmount : Math.abs(creditAmount);
      creditAmount = 0;
    }
    if (debitAmount < 0) {
      creditAmount = creditAmount > 0 ? creditAmount : Math.abs(debitAmount);
      debitAmount = 0;
    }

    creditAmount = this.roundSapAmount(creditAmount);
    debitAmount = this.roundSapAmount(debitAmount);

    if (creditAmount === 0 && debitAmount === 0) {
      throw new BadRequestException(
        `La fila ${rowLabel} no tiene importe de credito o debito para enviar a SAP.`
      );
    }

    return { debitAmount, creditAmount };
  }

  private excludeBankStatementRows(
    rows: ConciliationPreviewRow[],
    excludedRowIds?: string[]
  ): ConciliationPreviewRow[] {
    const excluded = new Set((excludedRowIds ?? []).filter(Boolean));
    if (excluded.size === 0) return rows;
    return rows.filter((row) => !excluded.has(row.rowId));
  }

  private isSapB1ProcessedBankStatement(statement: BankStatement): boolean {
    const source = this.normalizeUnknownText(statement.metadata?.source);
    const processedWith = this.normalizeUnknownText(statement.metadata?.processedWith);
    return statement.status === "sap_b1_processed" || processedWith === "sap_b1_bank_pages" || source === "sap_b1";
  }

  private async deleteSapB1BankStatementRows(statement: BankStatement): Promise<void> {
    const companyId = statement.companyBankAccount.company.id;
    const config = await this.findActiveSapB1Config(companyId);

    if (!config) {
      throw new BadRequestException(
        "La empresa no tiene una configuracion ERP activa con codigo SAP_B1 para eliminar el extracto en SAP."
      );
    }

    ensureSapErpType(config.erpType);
    validateSapConfig(config, false);

    const endpointPath = this.getConfigString(config, [
      "sapBankPagesEndpoint",
      "bankPagesEndpoint"
    ]) ?? "BankPages";
    const credentials = this.resolveSapSystemCredentials(config);
    const accountCode = normalizeRequired(
      statement.companyBankAccount.majorAccountNumber,
      "cuenta_bancaria_numero_mayor"
    );
    const login = await this.sapB1Service.login(config, credentials);
    const rows = [...(statement.rows ?? [])].sort((left, right) => left.rowNumber - right.rowNumber);

    for (const row of rows) {
      const sequence = this.readSapBankPageSequence(row);
      const rowAccountCode =
        this.normalizeUnknownText(row.normalized?.accountCode) ??
        this.normalizeUnknownText(row.normalized?.AccountCode) ??
        this.normalizeUnknownText(row.values?.AccountCode) ??
        accountCode;

      if (!sequence) {
        throw new BadRequestException(
          `No se encontro Sequence de SAP_B1 para eliminar la fila ${row.rowNumber} del extracto.`
        );
      }

      try {
        await this.sapB1Service.deleteBankPage(
          config,
          login.cookieHeader,
          rowAccountCode,
          sequence,
          endpointPath
        );
      } catch (error) {
        throw this.mapSapBankPageDeleteError(error, row.rowNumber, sequence);
      }
    }
  }

  private readSapBankPageSequence(row: BankStatementRow): number | null {
    const candidates = [
      row.normalized?.sequence,
      row.normalized?.Sequence,
      row.normalized?.BankStatementLineSequence,
      row.normalized?.bankStatementLineSequence,
      row.values?.Sequence
    ];

    for (const candidate of candidates) {
      const sequence =
        typeof candidate === "number"
          ? candidate
          : typeof candidate === "string"
            ? Number(candidate)
            : null;

      if (sequence !== null && Number.isInteger(sequence) && sequence > 0) {
        return sequence;
      }
    }

    return null;
  }

  private readPreviewRowString(row: ConciliationPreviewRow, keys: string[]): string | null {
    for (const key of keys) {
      const value = this.readPreviewRowValue(row, key);
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }

    return null;
  }

  private readPreviewRowAmount(row: ConciliationPreviewRow, keys: string[]): number | null {
    for (const key of keys) {
      const value = this.readPreviewRowValue(row, key);
      const numberValue = this.toSapNumber(value);
      if (numberValue !== null) {
        return numberValue;
      }
    }

    return null;
  }

  private readPreviewRowValue(row: ConciliationPreviewRow, key: string): unknown {
    const sources = [row.normalized, row.values];
    const normalizedKey = this.normalizeLookupKey(key);

    for (const source of sources) {
      if (!source) continue;

      const direct = source[key];
      if (direct !== undefined && direct !== null) return direct;

      const found = Object.entries(source).find(
        ([entryKey]) => this.normalizeLookupKey(entryKey) === normalizedKey
      );
      if (found?.[1] !== undefined && found[1] !== null) {
        return found[1];
      }
    }

    return undefined;
  }

  private normalizeSapDate(value: string | null): string | null {
    if (!value) return null;

    const raw = value.trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      return this.formatSapDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    }

    const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
    if (slashMatch) {
      let year = Number(slashMatch[3]);
      if (year < 100) {
        year += year >= 70 ? 1900 : 2000;
      }

      return this.formatSapDateParts(year, Number(slashMatch[2]), Number(slashMatch[1]));
    }

    const nativeDate = new Date(raw);
    if (!Number.isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString().slice(0, 10);
    }

    return null;
  }

  private formatSapDateParts(year: number, month: number, day: number): string | null {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  private toSapNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value).trim();
    if (!text || text === "-") return null;

    const cleaned = text
      .replace(/[A-Za-z$%]/g, "")
      .replace(/\s+/g, "")
      .replace(/[^\d,.\-+]/g, "");
    const normalized = this.normalizeNumericText(cleaned);

    if (!normalized || !/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeNumericText(value: string): string | null {
    if (!value) return null;

    const sign = value.startsWith("-") ? "-" : value.startsWith("+") ? "+" : "";
    const unsigned = value.replace(/^[-+]/, "");
    const lastDot = unsigned.lastIndexOf(".");
    const lastComma = unsigned.lastIndexOf(",");

    if (lastDot >= 0 && lastComma >= 0) {
      const decimalSeparator = lastDot > lastComma ? "." : ",";
      const thousandsSeparator = decimalSeparator === "." ? "," : ".";
      return `${sign}${unsigned
        .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
        .replace(decimalSeparator, ".")}`;
    }

    if (lastComma >= 0) {
      const groups = unsigned.split(",");
      const isThousandsOnly =
        groups.length > 1 && groups.slice(1).every((group) => group.length === 3);
      return `${sign}${isThousandsOnly ? groups.join("") : unsigned.replace(",", ".")}`;
    }

    if (lastDot >= 0) {
      const groups = unsigned.split(".");
      const isThousandsOnly =
        groups.length > 1 && groups.slice(1).every((group) => group.length === 3);
      return `${sign}${isThousandsOnly ? groups.join("") : unsigned}`;
    }

    return `${sign}${unsigned}`;
  }

  private roundSapAmount(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private extractSapSequence(payload: Record<string, unknown> | null): number | null {
    for (const source of [payload, this.asRecord(payload?.value)]) {
      if (!source) continue;

      for (const key of ["Sequence", "sequence", "BankStatementLineSequence"]) {
        const sequence = this.toSapNumber(source[key]);
        if (sequence !== null && Number.isInteger(sequence) && sequence > 0) {
          return sequence;
        }
      }
    }

    return null;
  }

  private getConfigString(config: CompanyErpConfig, keys: string[]): string | null {
    for (const key of keys) {
      const value = this.normalizeUnknownText(config.settings?.[key]);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private normalizeUnknownText(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

  private normalizeLookupKey(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private mapSapBankPageError(
    error: unknown,
    rowNumber: number,
    processedRows: number
  ): BadGatewayException | GatewayTimeoutException {
    const mapped = this.buildSapErrorMessage(error);
    const message = [
      `SAP rechazo la fila ${rowNumber} del extracto.`,
      mapped.message,
      processedRows > 0 ? `Filas enviadas antes del error: ${processedRows}.` : null
    ]
      .filter((item): item is string => Boolean(item))
      .join(" ");

    this.logger.error(
      this.compactJson({
        event: "sap_bank_page_failed",
        rowNumber,
        processedRows,
        error: mapped.logPayload
      })
    );

    return mapped.timeout ? new GatewayTimeoutException(message) : new BadGatewayException(message);
  }

  private mapSapBankPageDeleteError(
    error: unknown,
    rowNumber: number,
    sequence: number
  ): BadGatewayException | GatewayTimeoutException {
    const mapped = this.buildSapErrorMessage(error);
    const message = `No se pudo eliminar en SAP_B1 la fila ${rowNumber} del extracto (Sequence ${sequence}). ${mapped.message}`;

    this.logger.error(
      this.compactJson({
        event: "sap_bank_page_delete_failed",
        rowNumber,
        sequence,
        error: mapped.logPayload
      })
    );

    return mapped.timeout ? new GatewayTimeoutException(message) : new BadGatewayException(message);
  }

  private mapSapConnectionError(error: unknown): BadGatewayException | GatewayTimeoutException {
    const mapped = this.buildSapErrorMessage(error);
    const message = `No se pudo procesar el extracto en SAP_B1. ${mapped.message}`;

    this.logger.error(
      this.compactJson({
        event: "sap_bank_pages_process_failed",
        error: mapped.logPayload
      })
    );

    return mapped.timeout ? new GatewayTimeoutException(message) : new BadGatewayException(message);
  }

  private buildSapErrorMessage(error: unknown): {
    message: string;
    timeout: boolean;
    logPayload: Record<string, unknown>;
  } {
    if (error instanceof ExternalRequestError) {
      const payloadText = error.responsePayload ? ` Respuesta SAP: ${this.compactJson(error.responsePayload)}` : "";
      const statusText = error.statusCode ? `HTTP ${error.statusCode}. ` : "";
      const message = `${statusText}${error.message || "SAP rechazo la solicitud."}${payloadText}`;

      return {
        message,
        timeout: message.toLowerCase().includes("tiempo de espera"),
        logPayload: {
          message: error.message,
          statusCode: error.statusCode ?? null,
          responsePayload: error.responsePayload ?? null
        }
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      message,
      timeout: message.toLowerCase().includes("tiempo de espera"),
      logPayload: {
        message,
        stack: error instanceof Error ? error.stack : null
      }
    };
  }

  private compactJson(payload: Record<string, unknown>): string {
    const text = JSON.stringify(payload);
    const maxLength = 1500;

    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
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
        company: true,
        user: {
          company: true
        },
        accounts: {
          bank: true
        },
        layouts: {
          mappings: true,
          templateLayout: true
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
    const availability = await this.loadAvailabilityIdsByCompany([bank.company.id]);
    return toPublicUserBankWithLayouts(bank, availability.get(bank.company.id) ?? []);
  }

}
