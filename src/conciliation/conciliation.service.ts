import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import * as XLSX from "xlsx";
import { Role } from "../common/enums/role.enum";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { User } from "../users/entities/user.entity";
import { CreateLayoutDto } from "./dto/create-layout.dto";
import { CreateUserBankDto } from "./dto/create-user-bank.dto";
import { ListReconciliationsQueryDto } from "./dto/list-reconciliations-query.dto";
import { PreviewReconciliationDto } from "./dto/preview-reconciliation.dto";
import { SaveReconciliationDto } from "./dto/save-reconciliation.dto";
import { UpdateLayoutDto } from "./dto/update-layout.dto";
import { UpdateUserBankDto } from "./dto/update-user-bank.dto";
import { ReconciliationLayoutMapping } from "./entities/reconciliation-layout-mapping.entity";
import { ReconciliationLayout } from "./entities/reconciliation-layout.entity";
import { ReconciliationMatch } from "./entities/reconciliation-match.entity";
import { Reconciliation } from "./entities/reconciliation.entity";
import { UserBank } from "./entities/user-bank.entity";
import {
  CompareOperator,
  ConciliationKpiResponse,
  ConciliationPreviewMatch,
  ConciliationPreviewResponse,
  ConciliationPreviewRow,
  ConciliationRuleResult,
  PublicLayout,
  PublicLayoutMapping,
  PublicReconciliationDetail,
  PublicReconciliationSummary,
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

@Injectable()
export class ConciliationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserBank)
    private readonly userBankRepository: Repository<UserBank>,
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
    const resolvedUserId = this.resolveScopedUserId(actor, requestedUserId);

    const banks = await this.userBankRepository.find({
      where: resolvedUserId ? { user: { id: resolvedUserId } } : {},
      relations: {
        user: true,
        layouts: {
          mappings: true
        }
      }
    });

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

  async createUserBank(
    userId: number,
    payload: CreateUserBankDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts> {
    this.ensureSuperadmin(actor);

    const user = await this.requireUser(userId);
    const bank = this.userBankRepository.create({
      user,
      bankName: this.normalizeRequired(payload.bankName, "bankName"),
      alias: this.normalizeOptional(payload.alias),
      currency: this.normalizeRequired(payload.currency, "currency").toUpperCase(),
      accountNumber: this.normalizeOptional(payload.accountNumber),
      description: this.normalizeOptional(payload.description),
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
    payload: UpdateUserBankDto,
    actor: AuthUser
  ): Promise<PublicUserBankWithLayouts> {
    this.ensureSuperadmin(actor);

    const bank = await this.requireUserBank(userId, bankId);

    if (payload.bankName !== undefined) {
      bank.bankName = this.normalizeRequired(payload.bankName, "bankName");
    }
    if (payload.alias !== undefined) bank.alias = this.normalizeOptional(payload.alias);
    if (payload.currency !== undefined) {
      bank.currency = this.normalizeRequired(payload.currency, "currency").toUpperCase();
    }
    if (payload.accountNumber !== undefined) {
      bank.accountNumber = this.normalizeOptional(payload.accountNumber);
    }
    if (payload.description !== undefined) {
      bank.description = this.normalizeOptional(payload.description);
    }
    if (payload.active !== undefined) bank.active = payload.active;

    try {
      await this.userBankRepository.save(bank);
      return this.requirePublicUserBankWithLayouts(userId, bankId);
    } catch (error) {
      this.handleDatabaseError(error);
    }
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
      const bankRepository = manager.getRepository(UserBank);
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
          .where("ubk_id = :bankId", { bankId: userBank.id })
          .execute();
      }

      const createdLayout = await layoutRepository.save(
        layoutRepository.create({
          userBank,
          name: this.normalizeRequired(payload.name, "name"),
          description: this.normalizeOptional(payload.description),
          systemLabel: this.normalizeRequired(
            payload.systemLabel ?? "Sistema / ERP",
            "systemLabel"
          ),
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
          mappings: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("Layout no encontrado luego de crear.");
      }

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

      const layout = await layoutRepository.findOne({
        where: { id: layoutId, userBank: { id: bankId, user: { id: userId } } },
        relations: {
          userBank: {
            user: true
          },
          mappings: true
        }
      });

      if (!layout) {
        throw new NotFoundException("Layout no encontrado.");
      }

      if (payload.name !== undefined) layout.name = this.normalizeRequired(payload.name, "name");
      if (payload.description !== undefined) {
        layout.description = this.normalizeOptional(payload.description);
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
          .where("ubk_id = :bankId AND lyt_id <> :layoutId", { bankId, layoutId })
          .execute();
      }

      await layoutRepository.save(layout);

      if (payload.mappings !== undefined) {
        this.ensureMappings(payload.mappings);

        await mappingRepository
          .createQueryBuilder()
          .delete()
          .from(ReconciliationLayoutMapping)
          .where("lyt_id = :layoutId", { layoutId })
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
          mappings: true
        }
      });

      if (!updated) {
        throw new NotFoundException("Layout no encontrado luego de actualizar.");
      }

      return this.toPublicLayout(updated);
    });
  }

  async buildPreview(
    actor: AuthUser,
    payload: PreviewReconciliationDto,
    systemFile?: UploadedMemoryFile,
    bankFile?: UploadedMemoryFile
  ): Promise<ConciliationPreviewResponse> {
    if (!systemFile?.buffer) {
      throw new BadRequestException("Debes subir el Excel del sistema.");
    }
    if (!bankFile?.buffer) {
      throw new BadRequestException("Debes subir el Excel del banco.");
    }

    const { userBank, layout } = await this.requireAccessibleLayout(
      actor,
      payload.userBankId,
      payload.layoutId
    );

    const systemWorkbook = this.readWorkbook(systemFile.buffer, systemFile.originalname);
    const bankWorkbook = this.readWorkbook(bankFile.buffer, bankFile.originalname);

    const systemRows = this.extractRowsFromWorkbook(systemWorkbook, layout.mappings, "system");
    const bankRows = this.extractRowsFromWorkbook(bankWorkbook, layout.mappings, "bank");
    const autoMatches = this.buildAutoMatches(layout, systemRows, bankRows);
    const matchedSystemIds = new Set(autoMatches.map((item) => item.systemRowId));
    const matchedBankIds = new Set(autoMatches.map((item) => item.bankRowId));
    const unmatchedSystemRows = systemRows.filter((row) => !matchedSystemIds.has(row.rowId));
    const unmatchedBankRows = bankRows.filter((row) => !matchedBankIds.has(row.rowId));
    const metrics = this.buildMetrics(systemRows.length, bankRows.length, autoMatches.length, 0);

    return {
      userBank: this.toPublicUserBankSummary(userBank),
      layout: this.toPublicLayout(layout),
      systemFileName: systemFile.originalname,
      bankFileName: bankFile.originalname,
      systemRows,
      bankRows,
      autoMatches,
      manualMatches: [],
      unmatchedSystemRows,
      unmatchedBankRows,
      metrics
    };
  }

  async saveReconciliation(
    actor: AuthUser,
    payload: SaveReconciliationDto
  ): Promise<PublicReconciliationDetail> {
    const { userBank, layout } = await this.requireAccessibleLayout(
      actor,
      payload.userBankId,
      payload.layoutId
    );

    const systemRowMap = new Map(payload.systemRows.map((row) => [row.rowId, row]));
    const bankRowMap = new Map(payload.bankRows.map((row) => [row.rowId, row]));
    const metrics = this.buildMetrics(
      payload.systemRows.length,
      payload.bankRows.length,
      payload.autoMatches.length,
      payload.manualMatches.length
    );

    const matchedSystemIds = new Set<string>();
    const matchedBankIds = new Set<string>();

    for (const match of [...payload.autoMatches, ...payload.manualMatches]) {
      matchedSystemIds.add(match.systemRowId);
      matchedBankIds.add(match.bankRowId);
    }

    const unmatchedSystemRows = payload.systemRows.filter((row) => !matchedSystemIds.has(row.rowId));
    const unmatchedBankRows = payload.bankRows.filter((row) => !matchedBankIds.has(row.rowId));

    return this.reconciliationRepository.manager.transaction(async (manager) => {
      const reconciliationRepository = manager.getRepository(Reconciliation);
      const reconciliationMatchRepository = manager.getRepository(ReconciliationMatch);
      const userRepository = manager.getRepository(User);

      const persistedActor = await userRepository.findOne({ where: { id: actor.id } });
      if (!persistedActor) {
        throw new NotFoundException("Usuario ejecutor no encontrado.");
      }

      const reconciliation = await reconciliationRepository.save(
        reconciliationRepository.create({
          user: persistedActor,
          userBank,
          layout,
          name:
            this.normalizeOptional(payload.name) ??
            `Conciliacion ${userBank.alias ?? userBank.bankName} ${this.formatTodayTag()}`,
          status: payload.manualMatches.length > 0 ? "saved_with_manual_matches" : "saved",
          systemFileName: this.normalizeOptional(payload.systemFileName),
          bankFileName: this.normalizeOptional(payload.bankFileName),
          totalSystemRows: payload.systemRows.length,
          totalBankRows: payload.bankRows.length,
          autoMatches: payload.autoMatches.length,
          manualMatches: payload.manualMatches.length,
          unmatchedSystem: metrics.unmatchedSystem,
          unmatchedBank: metrics.unmatchedBank,
          matchPercentage: metrics.matchPercentage,
          summarySnapshot: {
            userBank: this.toPublicUserBankSummary(userBank),
            layout: this.toPublicLayout(layout),
            systemRows: payload.systemRows,
            bankRows: payload.bankRows,
            autoMatches: payload.autoMatches,
            manualMatches: payload.manualMatches,
            unmatchedSystemRows,
            unmatchedBankRows,
            metrics
          }
        })
      );

      const matches: ReconciliationMatch[] = [];

      for (const match of payload.autoMatches) {
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

      for (const match of payload.manualMatches) {
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

      for (const row of unmatchedSystemRows) {
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

      for (const row of unmatchedBankRows) {
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

      const persisted = await reconciliationRepository.findOne({
        where: { id: reconciliation.id },
        relations: {
          user: true,
          userBank: true,
          layout: true
        }
      });

      if (!persisted) {
        throw new NotFoundException("No se pudo recuperar la conciliacion guardada.");
      }

      return this.toPublicReconciliationDetail(persisted);
    });
  }

  async listReconciliations(
    actor: AuthUser,
    query: ListReconciliationsQueryDto
  ): Promise<PublicReconciliationSummary[]> {
    const reconciliations = await this.buildReconciliationQuery(actor, query).getMany();
    return reconciliations.map((item) => this.toPublicReconciliationSummary(item));
  }

  async getReconciliation(actor: AuthUser, id: number): Promise<PublicReconciliationDetail> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
      relations: {
        user: true,
        userBank: {
          user: true
        },
        layout: true
      }
    });

    if (!reconciliation) {
      throw new NotFoundException("Conciliacion no encontrada.");
    }

    if (actor.role !== Role.SUPERADMIN && reconciliation.user.id !== actor.id) {
      throw new ForbiddenException("No tenes permisos para ver esta conciliacion.");
    }

    return this.toPublicReconciliationDetail(reconciliation);
  }

  async getKpis(actor: AuthUser, requestedUserId?: number): Promise<ConciliationKpiResponse> {
    const query = new ListReconciliationsQueryDto();
    query.userId = requestedUserId;

    const reconciliations = await this.buildReconciliationQuery(actor, query).getMany();
    const totals = reconciliations.reduce(
      (accumulator, item) => {
        accumulator.totalReconciliations += 1;
        accumulator.totalAutoMatches += item.autoMatches;
        accumulator.totalManualMatches += item.manualMatches;
        accumulator.totalUnmatchedSystem += item.unmatchedSystem;
        accumulator.totalUnmatchedBank += item.unmatchedBank;
        accumulator.totalMatchPercentage += item.matchPercentage;
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
        totalMatchPercentage: number;
      }
    >();

    for (const item of reconciliations) {
      const current = bankAggregation.get(item.userBank.id) ?? {
        userBankId: item.userBank.id,
        bankName: item.userBank.bankName,
        alias: item.userBank.alias,
        totalReconciliations: 0,
        totalMatchPercentage: 0
      };

      current.totalReconciliations += 1;
      current.totalMatchPercentage += item.matchPercentage;
      bankAggregation.set(item.userBank.id, current);
    }

    return {
      totalReconciliations: totals.totalReconciliations,
      totalAutoMatches: totals.totalAutoMatches,
      totalManualMatches: totals.totalManualMatches,
      totalUnmatchedSystem: totals.totalUnmatchedSystem,
      totalUnmatchedBank: totals.totalUnmatchedBank,
      averageMatchPercentage:
        totals.totalReconciliations > 0
          ? this.roundNumber(totals.totalMatchPercentage / totals.totalReconciliations)
          : 0,
      bankBreakdown: [...bankAggregation.values()]
        .map((item) => ({
          userBankId: item.userBankId,
          bankName: item.bankName,
          alias: item.alias,
          totalReconciliations: item.totalReconciliations,
          averageMatchPercentage: this.roundNumber(
            item.totalMatchPercentage / item.totalReconciliations
          )
        }))
        .sort((left, right) => right.totalReconciliations - left.totalReconciliations),
      recentReconciliations: reconciliations.slice(0, 12).map((item) => ({
        id: item.id,
        name: item.name,
        bankName: item.userBank.bankName,
        alias: item.userBank.alias,
        layoutName: item.layout.name,
        matchPercentage: item.matchPercentage,
        autoMatches: item.autoMatches,
        manualMatches: item.manualMatches,
        unmatchedSystem: item.unmatchedSystem,
        unmatchedBank: item.unmatchedBank,
        createdAt: item.createdAt
      }))
    };
  }

  private buildReconciliationQuery(actor: AuthUser, query: ListReconciliationsQueryDto) {
    const scopedUserId = this.resolveScopedUserId(actor, query.userId);
    const queryBuilder = this.reconciliationRepository
      .createQueryBuilder("reconciliation")
      .leftJoinAndSelect("reconciliation.user", "user")
      .leftJoinAndSelect("reconciliation.userBank", "userBank")
      .leftJoinAndSelect("reconciliation.layout", "layout")
      .orderBy("reconciliation.createdAt", "DESC");

    if (scopedUserId) {
      queryBuilder.andWhere("user.id = :userId", { userId: scopedUserId });
    }

    if (query.userBankId) {
      queryBuilder.andWhere("userBank.id = :userBankId", { userBankId: query.userBankId });
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

  private async requireAccessibleLayout(
    actor: AuthUser,
    userBankId: number,
    layoutId: number
  ): Promise<{ userBank: UserBank; layout: ReconciliationLayout }> {
    const layout = await this.layoutRepository.findOne({
      where: {
        id: layoutId,
        userBank: {
          id: userBankId
        }
      },
      relations: {
        userBank: {
          user: true
        },
        mappings: true
      }
    });

    if (!layout) {
      throw new NotFoundException("Layout no encontrado para el banco seleccionado.");
    }

    if (actor.role !== Role.SUPERADMIN && layout.userBank.user.id !== actor.id) {
      throw new ForbiddenException("No tenes permisos sobre este banco/layout.");
    }

    return {
      userBank: layout.userBank,
      layout
    };
  }

  private buildAutoMatches(
    layout: ReconciliationLayout,
    systemRows: ConciliationPreviewRow[],
    bankRows: ConciliationPreviewRow[]
  ): ConciliationPreviewMatch[] {
    const mappings = this.sortMappings(layout.mappings).filter((item) => item.active);
    const threshold = this.normalizeThreshold(layout.autoMatchThreshold);
    const candidates: Array<ConciliationPreviewMatch & { passedRules: number }> = [];

    for (const systemRow of systemRows) {
      for (const bankRow of bankRows) {
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

    const matchedSystemIds = new Set<string>();
    const matchedBankIds = new Set<string>();
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
      case "date_equals":
        return this.normalizeDateValue(systemValue) === this.normalizeDateValue(bankValue);
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
      throw new BadRequestException("El layout no tiene mappings activos para comparar.");
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

  private toPublicUserBankWithLayouts(entity: UserBank): PublicUserBankWithLayouts {
    return {
      ...this.toPublicUserBank(entity),
      layouts: (entity.layouts ?? []).map((layout) => this.toPublicLayout(layout))
    };
  }

  private toPublicUserBank(entity: UserBank): PublicUserBank {
    return {
      ...this.toPublicUserBankSummary(entity),
      userId: entity.user.id,
      userLogin: entity.user.usrLogin
    };
  }

  private toPublicUserBankSummary(entity: UserBank): PublicUserBankSummary {
    return {
      id: entity.id,
      bankName: entity.bankName,
      alias: entity.alias,
      currency: entity.currency,
      accountNumber: entity.accountNumber,
      description: entity.description,
      active: entity.active
    };
  }

  private toPublicLayout(entity: ReconciliationLayout): PublicLayout {
    return {
      id: entity.id,
      userBankId: entity.userBank.id,
      name: entity.name,
      description: entity.description,
      systemLabel: entity.systemLabel,
      bankLabel: entity.bankLabel,
      autoMatchThreshold: entity.autoMatchThreshold,
      active: entity.active,
      mappings: this.sortMappings(entity.mappings ?? []).map((mapping) =>
        this.toPublicLayoutMapping(mapping)
      )
    };
  }

  private toPublicLayoutMapping(entity: ReconciliationLayoutMapping): PublicLayoutMapping {
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

  private toPublicReconciliationSummary(entity: Reconciliation): PublicReconciliationSummary {
    return {
      id: entity.id,
      name: entity.name,
      status: entity.status,
      userId: entity.user.id,
      userLogin: entity.user.usrLogin,
      userBankId: entity.userBank.id,
      bankName: entity.userBank.bankName,
      bankAlias: entity.userBank.alias,
      layoutId: entity.layout.id,
      layoutName: entity.layout.name,
      systemFileName: entity.systemFileName,
      bankFileName: entity.bankFileName,
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
      summarySnapshot: entity.summarySnapshot
    };
  }

  private sortMappings(mappings: ReconciliationLayoutMapping[]): ReconciliationLayoutMapping[] {
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
      throw new BadRequestException("Debes enviar al menos un campo de layout.");
    }

    const fieldKeys = new Set<string>();
    for (const mapping of mappings) {
      const normalizedKey = this.normalizeRequired(mapping.fieldKey, "fieldKey");
      if (fieldKeys.has(normalizedKey)) {
        throw new BadRequestException(`El campo ${normalizedKey} esta repetido en el layout.`);
      }

      fieldKeys.add(normalizedKey);
    }
  }

  private resolveScopedUserId(actor: AuthUser, requestedUserId?: number): number | undefined {
    if (actor.role === Role.SUPERADMIN) {
      return requestedUserId;
    }

    if (requestedUserId && requestedUserId !== actor.id) {
      throw new ForbiddenException("No podes consultar datos de otro usuario.");
    }

    return actor.id;
  }

  private ensureSuperadmin(actor: AuthUser) {
    if (actor.role !== Role.SUPERADMIN) {
      throw new ForbiddenException("Solo el superadmin puede administrar bancos y layouts.");
    }
  }

  private async requireUser(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    return user;
  }

  private async requireUserBank(userId: number, bankId: number): Promise<UserBank> {
    const bank = await this.userBankRepository.findOne({
      where: {
        id: bankId,
        user: {
          id: userId
        }
      },
      relations: {
        user: true,
        layouts: {
          mappings: true
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

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & {
        driverError?: { code?: string; detail?: string; constraint?: string };
      }).driverError;

      if (driverError?.code === "23505") {
        const detail = String(driverError.detail ?? "").toLowerCase();
        const constraint = String(driverError.constraint ?? "").toLowerCase();

        if (detail.includes("ubk_") || constraint.includes("usuarios_bancos")) {
          throw new ConflictException("Ya existe una asignacion de banco con esos datos.");
        }

        if (detail.includes("lmp_field_key") || constraint.includes("layout_mappings")) {
          throw new ConflictException("El layout no puede repetir fieldKey.");
        }

        if (constraint.includes("uq_conciliacion_layouts_active")) {
          throw new ConflictException("Solo puede haber un layout activo por banco.");
        }

        throw new ConflictException("Ya existe un registro con esos datos unicos.");
      }
    }

    throw error;
  }
}
