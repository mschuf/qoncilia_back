import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { appendFile, mkdir } from "fs/promises"
import { join } from "path"
import { Repository } from "typeorm"
import { CompanyErpConfig } from "../entities/company-erp-config.entity"
import { Role } from "../../common/enums/role.enum"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { decryptText, encryptText } from "../../common/utils/encryption.util"
import { isSuperAdminRole } from "../../common/utils/role.util"
import { BankStatement } from "../../conciliation/entities/bank-statement.entity"
import { BankStatementRow } from "../../conciliation/entities/bank-statement-row.entity"
import { CompanyBankAccount } from "../../conciliation/entities/company-bank-account.entity"
import { Reconciliation } from "../../conciliation/entities/reconciliation.entity"
import type { ConciliationPreviewRow } from "../../conciliation/interfaces/conciliation.interfaces"
import { User } from "../../users/entities/user.entity"
import { CompareSapB1QueryPreviewDto } from "./dto/compare-sap-b1-query-preview.dto"
import { RunSapB1QueryPreviewDto } from "./dto/run-sap-b1-query-preview.dto"
import { SapLoginDto } from "./dto/sap-login.dto"
import {
  SapExternalReconciliationBankStatementLineDto,
  SapExternalReconciliationMatchDto,
  SendSapExternalReconciliationDto,
  sapExternalReconciliationAccountTypes
} from "./dto/send-sap-external-reconciliation.dto"
import { UserErpSession } from "./entities/user-erp-session.entity"
import {
  PublicSapErpSession,
  PublicSapB1QueryComparisonResult,
  PublicSapB1QueryPreviewResult,
  PublicSapB1QueryTable,
  PublicSapB1SmartMatch,
  PublicSapExternalReconciliationResult,
  PublicSapSessionStatus,
  SapExternalReconciliationAccountType,
  SapExternalReconciliationBankStatementLinePayload,
  SapExternalReconciliationJournalEntryLinePayload,
  SapExternalReconciliationPayload
} from "./interfaces/sap-erp.interfaces"
import { ExternalRequestError, SapB1Service } from "./sap-b1.service"
import { ensureSapErpType, validateSapConfig } from "./sap-config.validator"

type SapReadableRow = {
  rowId?: string
  sourceRowId?: string
  rowNumber?: number
  values?: Record<string, unknown> | null
  normalized?: Record<string, unknown> | null
}

type HanaConnectionParams = {
  serverNode: string
  uid: string
  pwd: string
}

type HanaConnection = {
  connect(params: HanaConnectionParams, callback: (error?: Error | null) => void): void
  exec(sql: string, callback: (error: Error | null, rows?: Record<string, unknown>[]) => void): void
  exec(
    sql: string,
    params: unknown[],
    callback: (error: Error | null, rows?: Record<string, unknown>[]) => void
  ): void
  disconnect(callback?: (error?: Error | null) => void): void
}

type HanaClientModule = {
  createConnection(): HanaConnection
}

type PreparedSapB1Query = {
  sql: string
  params: unknown[]
}

type SapExternalReconciliationTraceContext = {
  actorId: number
  companyErpConfigId: number
  companyErpConfigName: string
  endpoint: string
  endpointPath: string
  reconciliationId: number | null
  sapPayload: SapExternalReconciliationPayload
}

type SapB1ComparableValue = string | number | null

type SapB1DateMatchResult = {
  matched: boolean
  differenceDays: number | null
}

// Roles de columna para el matching. amount = columna unica con signo (compat);
// debit/credit = columnas separadas (preferido).
type SapB1MatchColumns = {
  reference: string | null
  date: string | null
  amount: string | null
  debit: string | null
  credit: string | null
}

const SAP_B1_DATE_TOLERANCE_DAYS = 7

@Injectable()
export class SapErpService {
  private readonly logger = new Logger(SapErpService.name)
  private readonly credentialSecret: string

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BankStatement)
    private readonly bankStatementRepository: Repository<BankStatement>,
    @InjectRepository(CompanyBankAccount)
    private readonly companyBankAccountRepository: Repository<CompanyBankAccount>,
    @InjectRepository(Reconciliation)
    private readonly reconciliationRepository: Repository<Reconciliation>,
    @InjectRepository(CompanyErpConfig)
    private readonly companyErpConfigRepository: Repository<CompanyErpConfig>,
    @InjectRepository(UserErpSession)
    private readonly userErpSessionRepository: Repository<UserErpSession>,
    configService: ConfigService,
    private readonly sapB1Service: SapB1Service
  ) {
    this.credentialSecret =
      configService.get<string>("ERP_CREDENTIAL_SECRET")?.trim() ||
      configService.get<string>("JWT_SECRET", "CHANGE_THIS_FOR_A_LONG_RANDOM_SECRET")
  }

  async loginSapSession(actor: AuthUser, payload: SapLoginDto): Promise<PublicSapErpSession> {
    const [config, user] = await Promise.all([
      this.requireConfigForActor(actor, payload.companyErpConfigId),
      this.userRepository.findOne({ where: { id: actor.id } })
    ])

    if (!user) {
      throw new NotFoundException("Usuario no encontrado.")
    }

    ensureSapErpType(config.erpType)
    validateSapConfig(config, false)
    this.ensureActiveConfig(config)

    try {
      const credentials = this.resolveSapLoginCredentials(config, payload)
      const loginResult = await this.sapB1Service.login(config, {
        username: credentials.username,
        password: credentials.password
      })

      const repository = this.userErpSessionRepository
      const existing = await repository.findOne({
        where: {
          user: { id: user.id },
          companyErpConfig: { id: config.id }
        },
        relations: {
          user: true,
          companyErpConfig: true
        }
      })
      const now = new Date()
      const session = existing ?? repository.create({ user, companyErpConfig: config })

      session.erpType = config.erpType
      session.username = credentials.username
      session.sessionCookieEncrypted = encryptText(loginResult.cookieHeader, this.credentialSecret)
      session.expiresAt = loginResult.expiresAt
      session.lastValidatedAt = now
      session.invalidatedAt = null

      const saved = await repository.save(session)
      saved.companyErpConfig = config

      return this.toPublicSapSession(saved, "active", now)
    } catch (error) {
      const mapped = this.mapExternalError(error)
      throw mapped.exception
    }
  }

  async getSapSessionStatus(
    actor: AuthUser,
    companyErpConfigId: number,
    validateRemote: boolean
  ): Promise<PublicSapErpSession> {
    const config = await this.requireConfigForActor(actor, companyErpConfigId)
    const session = await this.userErpSessionRepository.findOne({
      where: {
        user: { id: actor.id },
        companyErpConfig: { id: config.id }
      },
      relations: {
        companyErpConfig: true
      }
    })
    const checkedAt = new Date()

    if (!session) {
      return this.toPublicSapSessionPlaceholder(config, "not_authenticated", checkedAt)
    }

    session.companyErpConfig = config

    if (session.invalidatedAt) {
      return this.toPublicSapSession(session, "logged_out", checkedAt)
    }

    if (session.expiresAt && session.expiresAt.getTime() <= checkedAt.getTime()) {
      session.invalidatedAt = checkedAt
      await this.userErpSessionRepository.save(session)
      return this.toPublicSapSession(session, "expired", checkedAt)
    }

    if (!validateRemote) {
      return this.toPublicSapSession(session, "active", checkedAt)
    }

    try {
      const cookieHeader = this.decryptSessionCookie(session.sessionCookieEncrypted)
      await this.sapB1Service.checkSession(config, cookieHeader)
      session.lastValidatedAt = checkedAt
      await this.userErpSessionRepository.save(session)
      return this.toPublicSapSession(session, "active", checkedAt)
    } catch {
      session.invalidatedAt = checkedAt
      await this.userErpSessionRepository.save(session)
      return this.toPublicSapSession(session, "invalid", checkedAt)
    }
  }

  async logoutSapSession(
    actor: AuthUser,
    companyErpConfigId: number
  ): Promise<PublicSapErpSession> {
    const config = await this.requireConfigForActor(actor, companyErpConfigId)
    const session = await this.userErpSessionRepository.findOne({
      where: {
        user: { id: actor.id },
        companyErpConfig: { id: config.id }
      },
      relations: {
        companyErpConfig: true
      }
    })
    const checkedAt = new Date()

    if (!session) {
      return this.toPublicSapSessionPlaceholder(config, "not_authenticated", checkedAt)
    }

    session.companyErpConfig = config
    session.invalidatedAt = checkedAt
    await this.userErpSessionRepository.save(session)

    return this.toPublicSapSession(session, "logged_out", checkedAt)
  }

  async runSapB1QueryPreview(
    actor: AuthUser,
    payload: RunSapB1QueryPreviewDto
  ): Promise<PublicSapB1QueryPreviewResult> {
    const config = await this.requireConfigForActor(actor, payload.companyErpConfigId)
    const account = await this.requireCompanyBankAccountForConfig(
      actor,
      config,
      payload.companyBankAccountId
    )

    ensureSapErpType(config.erpType)
    this.ensureActiveConfig(config)

    const companyDb = this.normalizeRequired(config.dbName, "CompanyDB")
    const accountCode = this.normalizeRequired(
      account.majorAccountNumber,
      "Cuenta Mayor"
    )
    const dateFrom = this.normalizeRequired(payload.dateFrom, "Fecha Desde")
    const dateTo = this.normalizeRequired(payload.dateTo, "Fecha Hasta")

    if (new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
      throw new BadRequestException("Fecha Desde no puede ser mayor a Fecha Hasta.")
    }

    const parameterValues = { accountCode, dateFrom, dateTo }
    const bankQuery = this.prepareSapB1PreviewQuery(
      config.queryBanco,
      companyDb,
      "query_banco",
      parameterValues
    )
    const systemQuery = this.prepareSapB1PreviewQuery(
      config.querySistema,
      companyDb,
      "query_sistema",
      parameterValues
    )
    const connection = await this.connectSapHana(config, companyDb)

    try {
      const bank = await this.executeSapB1PreviewQuery(connection, bankQuery, "query_banco")
      const system = await this.executeSapB1PreviewQuery(connection, systemQuery, "query_sistema")

      return {
        companyErpConfigId: config.id,
        companyErpConfigName: config.name,
        companyDb,
        accountCode,
        dateFrom,
        dateTo,
        bank,
        system
      }
    } catch (error) {
      this.logger.error(
        this.stringifyLogPayload({
          event: "sap_b1_query_preview_failed",
          actorId: actor.id,
          companyErpConfigId: config.id,
          companyBankAccountId: account.id,
          error: error instanceof Error ? error.message : String(error)
        })
      )

      throw new BadGatewayException(
        error instanceof Error
          ? `No se pudieron ejecutar las consultas SAP_B1. ${error.message}`
          : "No se pudieron ejecutar las consultas SAP_B1."
      )
    } finally {
      await this.disconnectSapHana(connection).catch(() => undefined)
    }
  }

  async compareSapB1QueryPreview(
    actor: AuthUser,
    payload: CompareSapB1QueryPreviewDto
  ): Promise<PublicSapB1QueryComparisonResult> {
    const config = await this.requireConfigForActor(actor, payload.companyErpConfigId)

    ensureSapErpType(config.erpType)
    this.ensureActiveConfig(config)

    const columns = this.resolveSapB1ComparisonColumns(payload)
    if (columns.length === 0) {
      throw new BadRequestException("No hay columnas disponibles para comparar.")
    }

    const excludedBankRowIds = new Set(payload.excludedBankRowIds ?? [])
    const excludedSystemRowIds = new Set(payload.excludedSystemRowIds ?? [])
    const bankRows = this.convertSapB1TableToPreviewRows(payload.bank)
      .filter((row) => !excludedBankRowIds.has(row.rowId))
    const systemRows = this.convertSapB1TableToPreviewRows(payload.system)
      .filter((row) => !excludedSystemRowIds.has(row.rowId))
    const matchColumns = this.classifySapB1MatchColumns(columns, [
      ...payload.bank.columns,
      ...payload.system.columns
    ])
    const matches = this.calculateSapB1SmartMatches(systemRows, bankRows, matchColumns)
    const matchedBankRowIds = new Set(matches.map((match) => match.bankRow.rowId))
    const matchedSystemRowIds = new Set(matches.map((match) => match.systemRow.rowId))
    const unmatchedBankRows = bankRows.filter((row) => !matchedBankRowIds.has(row.rowId))
    const unmatchedSystemRows = systemRows.filter((row) => !matchedSystemRowIds.has(row.rowId))
    const totalRows = systemRows.length + bankRows.length

    return {
      columns,
      matches,
      unmatchedSystemRows,
      unmatchedBankRows,
      metrics: {
        totalSystemRows: systemRows.length,
        totalBankRows: bankRows.length,
        matches: matches.length,
        unmatchedSystem: unmatchedSystemRows.length,
        unmatchedBank: unmatchedBankRows.length,
        matchPercentage:
          totalRows > 0 ? Math.round(((matches.length * 2) / totalRows) * 10000) / 100 : 0
      }
    }
  }

  async reconcileExternal(
    actor: AuthUser,
    payload: SendSapExternalReconciliationDto
  ): Promise<PublicSapExternalReconciliationResult> {
    this.ensureCanRunExternalReconciliation(actor)

    const config = await this.requireConfigForActor(actor, payload.companyErpConfigId)
    let reconciliation: Reconciliation | null = null

    if (payload.reconciliationId) {
      reconciliation = await this.reconciliationRepository.findOne({
        where: { id: payload.reconciliationId },
        relations: {
          user: {
            company: true
          },
          userBank: true,
          layout: true,
          companyBankAccount: {
            company: true,
            bank: true
          }
        }
      })

      if (!reconciliation) {
        throw new NotFoundException("Conciliacion no encontrada.")
      }

      this.ensureActorCanAccessReconciliation(actor, reconciliation)

      if (config.company.id !== reconciliation.user.company.id) {
        throw new BadRequestException(
          "La configuracion ERP no pertenece a la misma empresa de la conciliacion."
        )
      }
    }

    ensureSapErpType(config.erpType)
    validateSapConfig(config, false)
    this.ensureActiveConfig(config)

    const session = await this.requireActiveSapSession(actor, config)
    const endpointPath = this.getSettingsString(config, [
      "sapExternalReconciliationEndpoint",
      "externalReconciliationEndpoint"
    ]) ?? "ExternalReconciliationsService_Reconcile"
    const endpoint = this.sapB1Service.joinUrl(config.serviceLayerUrl, endpointPath)
    const sapPayload = await this.resolveSapExternalReconciliationPayload(
      actor,
      config,
      payload,
      reconciliation
    )
    const traceContext: SapExternalReconciliationTraceContext = {
      actorId: actor.id,
      companyErpConfigId: config.id,
      companyErpConfigName: config.name,
      endpoint,
      endpointPath,
      reconciliationId: reconciliation?.id ?? null,
      sapPayload
    }

    try {
      await this.logSapExternalReconciliationRequest(traceContext)
      const cookieHeader = this.decryptSessionCookie(session.sessionCookieEncrypted)
      const sapResponse = await this.sapB1Service.reconcileExternal(
        config,
        cookieHeader,
        sapPayload,
        endpointPath
      )
      const now = new Date()
      session.lastValidatedAt = now
      await this.userErpSessionRepository.save(session)
      await this.logSapExternalReconciliationSuccess({
        ...traceContext,
        sapStatusCode: sapResponse.statusCode,
        sapResponsePayload: sapResponse.bodyJson
      })

      return {
        id: 0,
        reconciliationId: reconciliation?.id ?? null,
        companyErpConfigId: config.id,
        companyErpConfigName: config.name,
        documentType: "external_reconciliation",
        status: "success",
        endpoint,
        httpStatus: sapResponse.statusCode,
        responsePayload: sapResponse.bodyJson,
        errorMessage: null,
        externalReconciliationNo: this.extractExternalReference(
          sapResponse.bodyJson,
          ["ReconciliationNo", "ReconciliationNumber", "ReconNum", "ExternalReconNo"]
        ),
        externalReference: this.extractExternalReference(
          sapResponse.bodyJson,
          ["AccountCode", "AbsEntry", "AbsoluteEntry", "Number"]
        ),
        createdAt: now,
        updatedAt: now
      }
    } catch (error) {
      if (error instanceof ExternalRequestError && [401, 403].includes(error.statusCode ?? 0)) {
        session.invalidatedAt = new Date()
        await this.userErpSessionRepository.save(session)
      }

      await this.logSapExternalReconciliationError(error, traceContext)
      const mapped = this.mapExternalError(error)
      throw mapped.exception
    }
  }

  private resolveSapB1ComparisonColumns(payload: CompareSapB1QueryPreviewDto): string[] {
    const systemColumnsByKey = new Map(
      payload.system.columns.map((column) => [this.normalizeLookupKey(column), column])
    )
    const bankColumnsByKey = new Map(
      payload.bank.columns.map((column) => [this.normalizeLookupKey(column), column])
    )
    const resolveColumn = (column: string) => {
      const key = this.normalizeLookupKey(column)
      return bankColumnsByKey.get(key) ?? systemColumnsByKey.get(key) ?? null
    }
    const uniqueColumns: string[] = []
    const seenKeys = new Set<string>()

    for (const requestedColumn of payload.columns ?? []) {
      const column = resolveColumn(requestedColumn)
      if (!column) continue

      const key = this.normalizeLookupKey(column)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      uniqueColumns.push(column)
    }

    if (uniqueColumns.length > 0) {
      return uniqueColumns.slice(0, 4)
    }

    const lookup = (...keys: string[]): string | null => {
      for (const key of keys) {
        const found = bankColumnsByKey.get(key) ?? systemColumnsByKey.get(key)
        if (found) return found
      }
      return null
    }
    const reference = lookup("referencia", "reference", "ref")
    const fecha = lookup("fecha", "date")
    const debito = lookup("debito", "debitos", "debe", "debit", "importedebito")
    const credito = lookup("credito", "creditos", "haber", "credit", "importecredito")
    const monto = lookup("monto", "importe", "amount")

    const preferredColumns: Array<string | null> = [reference, fecha]
    if (debito || credito) {
      preferredColumns.push(debito, credito)
    } else if (monto) {
      preferredColumns.push(monto)
    }
    const cleanedPreferred = preferredColumns.filter((column): column is string => Boolean(column))

    if (cleanedPreferred.length >= 3) {
      return cleanedPreferred
    }

    const commonColumns = payload.bank.columns.filter((column) =>
      systemColumnsByKey.has(this.normalizeLookupKey(column))
    )

    return (commonColumns.length > 0 ? commonColumns : payload.bank.columns).slice(0, 4)
  }

  private convertSapB1TableToPreviewRows(
    table: PublicSapB1QueryTable
  ): ConciliationPreviewRow[] {
    return table.rows.map((row, index) => {
      const values: Record<string, string | null> = {}
      const normalized: Record<string, string | number | null> = {}

      for (const column of table.columns) {
        const raw = row[column]
        const text = raw === undefined || raw === null ? null : String(raw)
        values[column] = text
        normalized[column] = text === null ? null : this.normalizeSapB1ComparableText(text)
      }

      return {
        rowId: `sap-b1-${index}`,
        rowNumber: index + 1,
        values,
        normalized
      }
    })
  }

  private calculateSapB1SmartMatches(
    systemRows: ConciliationPreviewRow[],
    bankRows: ConciliationPreviewRow[],
    columns: SapB1MatchColumns
  ): PublicSapB1SmartMatch[] {
    const hasAmount = Boolean(columns.amount || columns.debit || columns.credit)
    if (!columns.reference && !columns.date && !hasAmount) return []

    const matches: PublicSapB1SmartMatch[] = []
    const usedBankRows = new Set<string>()

    for (const systemRow of systemRows) {
      const systemNet = this.sapB1RowNet(systemRow, columns, "system")
      const candidates = bankRows
        .filter((bankRow) => !usedBankRows.has(bankRow.rowId))
        .map((bankRow) => {
          const referenceMatched = columns.reference
            ? this.sapB1ExactMatch(
                this.readSapB1PreviewRowValue(systemRow, columns.reference),
                this.readSapB1PreviewRowValue(bankRow, columns.reference)
              )
            : false
          const dateResult = columns.date
            ? this.sapB1DateMatchWithinDays(
                this.readSapB1PreviewRowRawValue(systemRow, columns.date),
                this.readSapB1PreviewRowRawValue(bankRow, columns.date),
                SAP_B1_DATE_TOLERANCE_DAYS
              )
            : { matched: false, differenceDays: null }
          const bankNet = this.sapB1RowNet(bankRow, columns, "bank")
          const amountMatched =
            systemNet !== null &&
            bankNet !== null &&
            Math.abs(systemNet) > 0.0001 &&
            Math.abs(systemNet - bankNet) < 0.0001

          // El monto debe coincidir SIEMPRE: si hay columna(s) de importe y
          // ambos netos estan presentes pero no cuadran, no es match aunque la
          // referencia coincida. Esto cubre tambien los netos de signo opuesto
          // con la convencion Debito/Credito (movimientos contrarios).
          if (
            hasAmount &&
            systemNet !== null &&
            bankNet !== null &&
            Math.abs(systemNet - bankNet) >= 0.0001
          ) {
            return null
          }

          const matchReason: PublicSapB1SmartMatch["matchReason"] | null = referenceMatched
            ? "reference"
            : dateResult.matched && amountMatched
              ? "date_amount"
              : null

          if (!matchReason) return null

          return {
            bankRow,
            score: matchReason === "reference" ? 1 : 0.95,
            column1Match: referenceMatched,
            column2Match: dateResult.matched,
            column3Match: amountMatched,
            matchReason,
            dateDifferenceDays: dateResult.differenceDays
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((left, right) => {
          if (left.matchReason !== right.matchReason) {
            return left.matchReason === "reference" ? -1 : 1
          }
          if (left.score !== right.score) return right.score - left.score

          const leftDateDiff = left.dateDifferenceDays ?? Number.MAX_SAFE_INTEGER
          const rightDateDiff = right.dateDifferenceDays ?? Number.MAX_SAFE_INTEGER
          return leftDateDiff - rightDateDiff
        })

      const chosen = candidates[0]
      if (!chosen) continue

      usedBankRows.add(chosen.bankRow.rowId)
      matches.push({
        systemRow,
        bankRow: chosen.bankRow,
        score: chosen.score,
        column1Match: chosen.column1Match,
        column2Match: chosen.column2Match,
        column3Match: chosen.column3Match,
        matchReason: chosen.matchReason,
        dateDifferenceDays: chosen.dateDifferenceDays
      })
    }

    return matches
  }

  // Clasifica las columnas de comparacion en roles (referencia/fecha/importe).
  // `availableColumns` (todas las columnas disponibles) permite completar el par
  // Debito/Credito si la lista de comparacion truncada dejo solo uno.
  private classifySapB1MatchColumns(
    columns: string[],
    availableColumns: string[] = columns
  ): SapB1MatchColumns {
    const DEBIT_KEYS = ["debito", "debitos", "debe", "debit", "importedebito"]
    const CREDIT_KEYS = ["credito", "creditos", "haber", "credit", "importecredito"]
    const makeFinder = (cols: string[]) => {
      const byKey = new Map(cols.map((column) => [this.normalizeLookupKey(column), column]))
      return (...keys: string[]): string | null => {
        for (const key of keys) {
          const found = byKey.get(key)
          if (found) return found
        }
        return null
      }
    }
    const find = makeFinder(columns)
    const findAvailable = makeFinder(availableColumns)

    const reference = find("referencia", "reference", "ref")
    const date = find("fecha", "date")
    let debit = find(...DEBIT_KEYS)
    let credit = find(...CREDIT_KEYS)
    let amount = find("monto", "importe", "amount")

    // Si solo sobrevivio uno del par Debito/Credito, completar con el otro desde
    // el set completo de columnas (la convencion de signo necesita ambos).
    if (debit && !credit) credit = findAvailable(...CREDIT_KEYS)
    if (credit && !debit) debit = findAvailable(...DEBIT_KEYS)

    // Compat: si no hay columna de importe reconocida, usar la primera columna
    // de comparacion que no sea referencia ni fecha.
    if (!amount && !debit && !credit) {
      const used = new Set(
        [reference, date]
          .filter((column): column is string => Boolean(column))
          .map((column) => this.normalizeLookupKey(column))
      )
      amount = columns.find((column) => !used.has(this.normalizeLookupKey(column))) ?? null
    }

    return { reference, date, amount, debit, credit }
  }

  // Importe neto con signo de una fila. La convencion de signo (que invierte por
  // lado para que ingreso y egreso coincidan entre banco y sistema) SOLO aplica
  // cuando estan AMBAS columnas Debito y Credito:
  //   banco:   ingreso = Credito (+), egreso = Debito (-)
  //   sistema: ingreso = Debito  (+), egreso = Credito (-)
  private sapB1RowNet(
    row: ConciliationPreviewRow,
    columns: SapB1MatchColumns,
    side: "bank" | "system"
  ): number | null {
    if (columns.debit && columns.credit) {
      const debit = this.parseSapB1AmountValue(
        this.readSapB1PreviewRowRawValue(row, columns.debit)
      )
      const credit = this.parseSapB1AmountValue(
        this.readSapB1PreviewRowRawValue(row, columns.credit)
      )
      if (debit === null && credit === null) return null
      const debitValue = Math.abs(debit ?? 0)
      const creditValue = Math.abs(credit ?? 0)
      return side === "bank" ? creditValue - debitValue : debitValue - creditValue
    }

    // Columna unica (importe con signo, o solo debito, o solo credito): se toma
    // tal cual, sin invertir por lado (no asumimos convencion de signo).
    const singleColumn = columns.amount ?? columns.debit ?? columns.credit
    if (singleColumn) {
      return this.parseSapB1AmountValue(this.readSapB1PreviewRowRawValue(row, singleColumn))
    }

    return null
  }

  private readSapB1PreviewRowValue(
    row: ConciliationPreviewRow,
    fieldKey: string | undefined
  ): SapB1ComparableValue {
    if (!fieldKey) return null
    return row.normalized[fieldKey] ?? row.values[fieldKey] ?? null
  }

  private readSapB1PreviewRowRawValue(
    row: ConciliationPreviewRow,
    fieldKey: string | undefined
  ): SapB1ComparableValue {
    if (!fieldKey) return null
    return row.values[fieldKey] ?? row.normalized[fieldKey] ?? null
  }

  private normalizeSapB1ComparableText(value: SapB1ComparableValue): string | null {
    if (value == null) return null

    const text = String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()

    return text || null
  }

  private sapB1ExactMatch(
    left: SapB1ComparableValue,
    right: SapB1ComparableValue
  ): boolean {
    const normalizedLeft = this.normalizeSapB1ComparableText(left)
    const normalizedRight = this.normalizeSapB1ComparableText(right)
    if (!normalizedLeft || !normalizedRight) return false
    return normalizedLeft === normalizedRight
  }

  private parseSapB1AmountValue(value: SapB1ComparableValue): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (value == null) return null

    const text = String(value).trim()
    if (!text || text === "-") return null

    const cleaned = text
      .replace(/[A-Za-z$%]/g, "")
      .replace(/\s+/g, "")
      .replace(/[^\d,.\-+]/g, "")
    const normalized = this.normalizeSapB1NumericText(cleaned)
    if (!normalized || !/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  private normalizeSapB1NumericText(value: string): string | null {
    if (!value) return null

    const sign = value.startsWith("-") ? "-" : value.startsWith("+") ? "+" : ""
    const unsigned = value.replace(/^[-+]/, "")
    const lastDot = unsigned.lastIndexOf(".")
    const lastComma = unsigned.lastIndexOf(",")

    if (lastDot >= 0 && lastComma >= 0) {
      const decimalSeparator = lastDot > lastComma ? "." : ","
      const thousandsSeparator = decimalSeparator === "." ? "," : "."
      return `${sign}${unsigned
        .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
        .replace(decimalSeparator, ".")}`
    }

    if (lastComma >= 0) {
      const groups = unsigned.split(",")
      const isThousandsOnly =
        groups.length > 1 && groups.slice(1).every((group) => group.length === 3)
      return `${sign}${isThousandsOnly ? groups.join("") : unsigned.replace(",", ".")}`
    }

    if (lastDot >= 0) {
      const groups = unsigned.split(".")
      const isThousandsOnly =
        groups.length > 1 && groups.slice(1).every((group) => group.length === 3)
      return `${sign}${isThousandsOnly ? groups.join("") : unsigned}`
    }

    return `${sign}${unsigned}`
  }

  private sapB1DateMatchWithinDays(
    left: SapB1ComparableValue,
    right: SapB1ComparableValue,
    toleranceDays: number
  ): SapB1DateMatchResult {
    const leftDay = this.parseSapB1DateDayNumber(left)
    const rightDay = this.parseSapB1DateDayNumber(right)
    if (leftDay === null || rightDay === null) {
      return {
        matched: this.sapB1ExactMatch(left, right),
        differenceDays: null
      }
    }

    const differenceDays = Math.abs(leftDay - rightDay)
    return {
      matched: differenceDays <= toleranceDays,
      differenceDays
    }
  }

  private parseSapB1DateDayNumber(value: SapB1ComparableValue): number | null {
    if (value == null) return null

    const raw = String(value).trim()
    if (!raw) return null

    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (isoMatch) {
      return this.buildSapB1UtcDayNumber(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3])
      )
    }

    const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/)
    if (slashMatch) {
      let year = Number(slashMatch[3])
      if (year < 100) year += year >= 70 ? 1900 : 2000
      return this.buildSapB1UtcDayNumber(year, Number(slashMatch[2]), Number(slashMatch[1]))
    }

    const parsed = Date.parse(raw)
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 86400000)
  }

  private buildSapB1UtcDayNumber(
    year: number,
    month: number,
    day: number
  ): number | null {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null
    }

    const date = new Date(Date.UTC(year, month - 1, day))
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null
    }

    return Math.floor(date.getTime() / 86400000)
  }

  private async requireConfigForActor(
    actor: AuthUser,
    companyErpConfigId: number
  ): Promise<CompanyErpConfig> {
    const config = await this.companyErpConfigRepository.findOne({
      where: { id: companyErpConfigId },
      relations: { company: true }
    })

    if (!config) {
      throw new NotFoundException("Configuracion ERP no encontrada.")
    }

    if (!isSuperAdminRole(actor.roleCode) && config.company.id !== actor.companyId) {
      throw new ForbiddenException("No podes usar configuraciones ERP de otra empresa.")
    }

    return config
  }

  private ensureActiveConfig(config: CompanyErpConfig) {
    if (!config.active) {
      throw new BadRequestException("La configuracion ERP seleccionada esta inactiva.")
    }
  }

  private async requireCompanyBankAccountForConfig(
    actor: AuthUser,
    config: CompanyErpConfig,
    companyBankAccountId: number
  ): Promise<CompanyBankAccount> {
    const account = await this.companyBankAccountRepository.findOne({
      where: { id: companyBankAccountId },
      relations: { company: true, bank: true }
    })

    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada.")
    }

    if (!isSuperAdminRole(actor.roleCode) && account.company.id !== actor.companyId) {
      throw new ForbiddenException("No podes consultar cuentas bancarias de otra empresa.")
    }

    if (account.company.id !== config.company.id) {
      throw new BadRequestException(
        "La cuenta bancaria no pertenece a la empresa de la configuracion ERP."
      )
    }

    return account
  }

  private async connectSapHana(
    config: CompanyErpConfig,
    companyDb: string
  ): Promise<HanaConnection> {
    const serverNode = this.normalizeRequired(config.serverNode, "Server Node")
    const dbUser = this.normalizeRequired(config.dbUser, "DB user")

    if (!config.dbPasswordEncrypted) {
      throw new BadRequestException("DB password es obligatorio para ejecutar consultas SAP_B1.")
    }

    const password = decryptText(config.dbPasswordEncrypted, this.credentialSecret)
    const hana = this.requireSapHanaClient()
    const connection = hana.createConnection()
    const connectionParams = {
      serverNode,
      uid: dbUser,
      pwd: password
    }

    console.log("[SAP_HANA] Conexion preparada", {
      serverNode,
      uid: dbUser,
      schema: companyDb,
      hasPassword: Boolean(password)
    })

    await new Promise<void>((resolve, reject) => {
      connection.connect(connectionParams, (error) => {
        if (error) {
          console.error("[SAP_HANA] Error de conexion", {
            serverNode,
            uid: dbUser,
            schema: companyDb,
            error: error.message
          })
          reject(error)
          return
        }

        console.log("[SAP_HANA] Conectado", { serverNode, uid: dbUser, schema: companyDb })
        resolve()
      })
    })

    await this.executeSapHanaCommand(connection, `SET SCHEMA "${companyDb.replace(/"/g, '""')}"`)
    console.log("[SAP_HANA] Schema activo", { schema: companyDb })

    return connection
  }

  private requireSapHanaClient(): HanaClientModule {
    try {
      return require("@sap/hana-client") as HanaClientModule
    } catch {
      throw new BadRequestException(
        "No esta instalado @sap/hana-client. Ejecuta npm install @sap/hana-client en QonciliaBack."
      )
    }
  }

  private async disconnectSapHana(connection: HanaConnection): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      connection.disconnect((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private prepareSapB1PreviewQuery(
    rawQuery: string | null,
    companyDb: string,
    field: string,
    values: { accountCode: string; dateFrom: string; dateTo: string }
  ): PreparedSapB1Query {
    const normalized = this.normalizeRequired(rawQuery, field)
    const withoutTrailingSemicolon = normalized.replace(/;\s*$/, "")

    if (withoutTrailingSemicolon.includes(";")) {
      throw new BadRequestException(`${field} no puede contener multiples sentencias.`)
    }

    if (!/^select\b/i.test(withoutTrailingSemicolon)) {
      throw new BadRequestException(`${field} debe ser una consulta SELECT.`)
    }

    const forbidden =
      /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|call|do|execute)\b/i
    if (forbidden.test(withoutTrailingSemicolon)) {
      throw new BadRequestException(`${field} contiene una operacion no permitida.`)
    }

    const sqlWithSchema = withoutTrailingSemicolon.replace(
      /\$\{CompanyDB\}/g,
      companyDb.replace(/"/g, '""')
    )
    const params: unknown[] = []
    const sql = sqlWithSchema.replace(/\$(1|2|3)\b/g, (_match, index: string) => {
      const valueByIndex: Record<string, unknown> = {
        "1": values.accountCode,
        "2": values.dateFrom,
        "3": values.dateTo
      }
      params.push(valueByIndex[index])
      return "?"
    })

    console.log("[SAP_HANA] Query armado", {
      field,
      sql,
      params
    })

    return { sql, params }
  }

  private async executeSapB1PreviewQuery(
    connection: HanaConnection,
    query: PreparedSapB1Query,
    label: string
  ): Promise<PublicSapB1QueryTable> {
    console.log("[SAP_HANA] Ejecutando query", {
      label,
      sql: query.sql,
      params: query.params
    })
    const rows = await this.executeSapHanaQuery(connection, query.sql, query.params)
    const columns = this.resolveQueryColumns(rows)

    return {
      columns,
      rows: rows.map((row) => this.toPublicQueryRow(row))
    }
  }

  private async executeSapHanaCommand(connection: HanaConnection, sql: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      connection.exec(sql, (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private async executeSapHanaQuery(
    connection: HanaConnection,
    sql: string,
    params: unknown[]
  ): Promise<Record<string, unknown>[]> {
    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      connection.exec(sql, params, (error, rows) => {
        if (error) {
          reject(error)
          return
        }

        resolve(rows ?? [])
      })
    })
  }

  private resolveQueryColumns(rows: Record<string, unknown>[]): string[] {
    const columns = new Set<string>()
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => columns.add(key))
    })
    return [...columns]
  }

  private toPublicQueryRow(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (value instanceof Date) {
          return [key, value.toISOString()]
        }

        if (typeof value === "bigint") {
          return [key, value.toString()]
        }

        return [key, value]
      })
    )
  }

  private ensureCanRunExternalReconciliation(actor: AuthUser) {
    if (
      isSuperAdminRole(actor.roleCode) ||
      actor.roleCode === Role.ADMIN ||
      actor.roleCode === Role.GESTOR_COBRANZA
    ) {
      return
    }

    throw new ForbiddenException(
      "Solo usuarios admin, superadmin o gestor de cobranzas pueden enviar conciliaciones externas al ERP."
    )
  }

  private async requireActiveSapSession(
    actor: AuthUser,
    config: CompanyErpConfig
  ): Promise<UserErpSession> {
    const session = await this.userErpSessionRepository.findOne({
      where: {
        user: { id: actor.id },
        companyErpConfig: { id: config.id }
      },
      relations: {
        companyErpConfig: true
      }
    })
    const now = new Date()

    if (!session || session.invalidatedAt) {
      throw new BadRequestException("Debes iniciar sesion en SAP antes de conciliar en el ERP.")
    }

    if (session.expiresAt && session.expiresAt.getTime() <= now.getTime()) {
      session.invalidatedAt = now
      await this.userErpSessionRepository.save(session)
      throw new BadRequestException("La sesion de SAP expiro. Volve a iniciar sesion.")
    }

    session.companyErpConfig = config
    return session
  }

  private ensureActorCanAccessReconciliation(actor: AuthUser, reconciliation: Reconciliation) {
    if (isSuperAdminRole(actor.roleCode)) {
      return
    }

    if (actor.roleCode === Role.ADMIN && reconciliation.user.company.id === actor.companyId) {
      return
    }

    if (
      actor.roleCode === Role.GESTOR_COBRANZA &&
      reconciliation.user.company.id === actor.companyId
    ) {
      return
    }

    throw new ForbiddenException("No tenes permisos para enviar esta conciliacion al ERP.")
  }

  private async resolveSapExternalReconciliationPayload(
    actor: AuthUser,
    config: CompanyErpConfig,
    payload: SendSapExternalReconciliationDto,
    reconciliation: Reconciliation | null
  ): Promise<SapExternalReconciliationPayload> {
    if (payload.payload) {
      return this.normalizeRawSapExternalReconciliationPayload(payload.payload, config)
    }

    return this.buildSapExternalReconciliationPayload(actor, config, payload, reconciliation)
  }

  private normalizeRawSapExternalReconciliationPayload(
    payload: Record<string, unknown>,
    config: CompanyErpConfig
  ): SapExternalReconciliationPayload {
    const wrappedExternal = this.asRecord(payload.ExternalReconciliation)
    const external = wrappedExternal ?? payload
    const bankLines = external.ReconciliationBankStatementLines
    const journalLines = external.ReconciliationJournalEntryLines

    if (!Array.isArray(bankLines) || bankLines.length === 0) {
      throw new BadRequestException(
        "La conciliacion externa SAP debe tener ReconciliationBankStatementLines."
      )
    }

    if (!Array.isArray(journalLines) || journalLines.length === 0) {
      throw new BadRequestException(
        "La conciliacion externa SAP debe tener ReconciliationJournalEntryLines."
      )
    }

    const normalizedExternal = {
      ...external,
      ReconciliationAccountType: this.resolveExternalReconciliationAccountType(
        external.ReconciliationAccountType,
        config
      ),
      ReconciliationBankStatementLines: bankLines.map((line, index) =>
        this.normalizeRawBankStatementLine(line, index)
      ),
      ReconciliationJournalEntryLines: journalLines.map((line, index) =>
        this.normalizeRawJournalEntryLine(line, index)
      )
    }

    return {
      ExternalReconciliation: normalizedExternal
    } as SapExternalReconciliationPayload
  }

  private async buildSapExternalReconciliationPayload(
    actor: AuthUser,
    config: CompanyErpConfig,
    payload: SendSapExternalReconciliationDto,
    reconciliation: Reconciliation | null
  ): Promise<SapExternalReconciliationPayload> {
    const statement = payload.bankStatementId
      ? await this.requireBankStatementForExternalReconciliation(
          actor,
          config,
          payload.bankStatementId
        )
      : null
    const account = statement?.companyBankAccount ?? reconciliation?.companyBankAccount ?? null

    if (!account && !payload.accountCode) {
      throw new BadRequestException(
        "Para conciliar en SAP debes enviar accountCode, bankStatementId o reconciliationId."
      )
    }

    if (account && config.company.id !== account.company.id) {
      throw new BadRequestException(
        "La configuracion ERP no pertenece a la empresa de la cuenta bancaria."
      )
    }

    const fallbackAccountCode =
      this.normalizeOptional(payload.accountCode) ??
      this.getSettingsString(config, [
        "sapBankStatementAccountCode",
        "bankStatementAccountCode",
        "sapExternalReconciliationAccountCode",
        "externalReconciliationAccountCode"
      ]) ??
      this.normalizeOptional(account?.majorAccountNumber) ??
      this.normalizeOptional(account?.bankErpId) ??
      this.normalizeOptional(account?.accountNumber)
    const allowRowNumberAsSequence = this.getSettingsBoolean(config, [
      "sapExternalReconciliationUseRowNumberAsSequence",
      "useRowNumberAsSequence"
    ])
    const bankStatementLines = this.buildBankStatementLines(
      payload.bankStatementLines,
      payload.matches,
      statement,
      fallbackAccountCode,
      allowRowNumberAsSequence
    )
    const journalEntryLines = this.buildJournalEntryLines(payload.journalEntryLines, payload.matches)
    const resolvedAccountCode = fallbackAccountCode ?? bankStatementLines[0]?.BankStatementAccountCode

    if (!resolvedAccountCode) {
      throw new BadRequestException(
        "No se pudo resolver AccountCode para la conciliacion externa SAP."
      )
    }

    return {
      ExternalReconciliation: {
        ReconciliationAccountType: this.resolveExternalReconciliationAccountType(
          payload.reconciliationAccountType,
          config
        ),
        AccountCode: resolvedAccountCode,
        ReconciliationBankStatementLines: bankStatementLines,
        ReconciliationJournalEntryLines: journalEntryLines
      }
    }
  }

  private buildBankStatementLines(
    inputLines: SapExternalReconciliationBankStatementLineDto[] | undefined,
    matches: SapExternalReconciliationMatchDto[] | undefined,
    statement: BankStatement | null,
    fallbackAccountCode: string | null,
    allowRowNumberAsSequence: boolean
  ): SapExternalReconciliationBankStatementLinePayload[] {
    if (inputLines?.length) {
      return inputLines.map((line, index) => {
        const sequence = this.toPositiveInteger(line.sequence ?? line.bankStatementLineSequence)
        const accountCode = this.normalizeOptional(line.bankStatementAccountCode) ?? fallbackAccountCode

        if (!sequence) {
          throw new BadRequestException(
            `No se encontro Sequence para la linea bancaria ${index + 1}.`
          )
        }

        if (!accountCode) {
          throw new BadRequestException(
            `No se encontro BankStatementAccountCode para la linea bancaria ${index + 1}.`
          )
        }

        return {
          BankStatementAccountCode: accountCode,
          Sequence: sequence
        }
      })
    }

    if (!matches?.length) {
      throw new BadRequestException(
        "Debes enviar bankStatementLines o matches para construir la conciliacion externa SAP."
      )
    }

    const rowsBySourceId = new Map<string, BankStatementRow>()
    const rowsByDbId = new Map<number, BankStatementRow>()
    for (const row of statement?.rows ?? []) {
      rowsBySourceId.set(row.sourceRowId, row)
      rowsByDbId.set(row.id, row)
    }

    return matches.map((match, index) => {
      const bankRow =
        (match.bankStatementRowId ? rowsByDbId.get(match.bankStatementRowId) : null) ??
        (match.bankRowId ? rowsBySourceId.get(match.bankRowId) : null) ??
        null
      const sequence =
        this.toPositiveInteger(match.sequence ?? match.bankStatementLineSequence) ??
        this.readRowNumber(bankRow, [
          "Sequence",
          "sequence",
          "BankStatementLineSequence",
          "bankStatementLineSequence",
          "lineSequence",
          "secuencia",
          "lineaBanco",
          "nroLineaBanco",
          "linea"
        ]) ??
        (allowRowNumberAsSequence && bankRow?.rowNumber && bankRow.rowNumber > 0
          ? bankRow.rowNumber
          : null)
      const accountCode =
        this.normalizeOptional(match.bankStatementAccountCode) ??
        this.readRowText(bankRow, [
          "BankStatementAccountCode",
          "bankStatementAccountCode",
          "AccountCode",
          "accountCode",
          "cuentaSap",
          "cuentaSAP",
          "codigoCuenta",
          "codigoCuentaBanco"
        ]) ??
        fallbackAccountCode

      if (!sequence) {
        throw new BadRequestException(
          `No se encontro Sequence para el match ${index + 1}. Mapea o envia la secuencia OBNK de SAP.`
        )
      }

      if (!accountCode) {
        throw new BadRequestException(
          `No se encontro BankStatementAccountCode para el match ${index + 1}. Configuralo en la cuenta bancaria o en settings del ERP.`
        )
      }

      return {
        BankStatementAccountCode: accountCode,
        Sequence: sequence
      }
    })
  }

  private buildJournalEntryLines(
    inputLines: SendSapExternalReconciliationDto["journalEntryLines"],
    matches: SapExternalReconciliationMatchDto[] | undefined
  ): SapExternalReconciliationJournalEntryLinePayload[] {
    if (inputLines?.length) {
      return inputLines.map((line, index) => {
        const transactionNumber = this.toPositiveInteger(line.transactionNumber)
        const lineNumber = this.toNonNegativeInteger(line.lineNumber)

        if (!transactionNumber) {
          throw new BadRequestException(
            `No se encontro TransactionNumber para la linea contable ${index + 1}.`
          )
        }

        if (lineNumber === null) {
          throw new BadRequestException(
            `No se encontro LineNumber para la linea contable ${index + 1}.`
          )
        }

        return {
          TransactionNumber: transactionNumber,
          LineNumber: lineNumber
        }
      })
    }

    if (!matches?.length) {
      throw new BadRequestException(
        "Debes enviar journalEntryLines o matches con TransactionNumber y LineNumber."
      )
    }

    return matches.map((match, index) => {
      const transactionNumber = this.toPositiveInteger(match.transactionNumber)
      const lineNumber = this.toNonNegativeInteger(match.lineNumber)

      if (!transactionNumber) {
        throw new BadRequestException(
          `No se encontro TransactionNumber para el match ${index + 1}. Mapea ese dato desde las filas del sistema.`
        )
      }

      if (lineNumber === null) {
        throw new BadRequestException(
          `No se encontro LineNumber para el match ${index + 1}. Mapea ese dato desde las filas del sistema.`
        )
      }

      return {
        TransactionNumber: transactionNumber,
        LineNumber: lineNumber
      }
    })
  }

  private normalizeRawBankStatementLine(
    value: unknown,
    index: number
  ): SapExternalReconciliationBankStatementLinePayload {
    const line = this.asRecord(value)
    if (!line) {
      throw new BadRequestException(`La linea bancaria ${index + 1} no es valida.`)
    }

    const accountCode = this.normalizeOptional(
      line.BankStatementAccountCode ?? line.bankStatementAccountCode ?? line.AccountCode
    )
    const sequence = this.toPositiveInteger(
      line.Sequence ?? line.sequence ?? line.BankStatementLineSequence ?? line.bankStatementLineSequence
    )

    if (!accountCode) {
      throw new BadRequestException(
        `No se encontro BankStatementAccountCode para la linea bancaria ${index + 1}.`
      )
    }

    if (!sequence) {
      throw new BadRequestException(
        `No se encontro Sequence para la linea bancaria ${index + 1}.`
      )
    }

    return {
      ...line,
      BankStatementAccountCode: accountCode,
      Sequence: sequence
    }
  }

  private normalizeRawJournalEntryLine(
    value: unknown,
    index: number
  ): SapExternalReconciliationJournalEntryLinePayload {
    const line = this.asRecord(value)
    if (!line) {
      throw new BadRequestException(`La linea contable ${index + 1} no es valida.`)
    }

    const transactionNumber = this.toPositiveInteger(
      line.TransactionNumber ?? line.transactionNumber ?? line.TransId ?? line.transId
    )
    const lineNumber = this.toNonNegativeInteger(line.LineNumber ?? line.lineNumber)

    if (!transactionNumber) {
      throw new BadRequestException(
        `No se encontro TransactionNumber para la linea contable ${index + 1}.`
      )
    }

    if (lineNumber === null) {
      throw new BadRequestException(
        `No se encontro LineNumber para la linea contable ${index + 1}.`
      )
    }

    return {
      ...line,
      TransactionNumber: transactionNumber,
      LineNumber: lineNumber
    }
  }

  private async requireBankStatementForExternalReconciliation(
    actor: AuthUser,
    config: CompanyErpConfig,
    bankStatementId: number
  ): Promise<BankStatement> {
    const statement = await this.bankStatementRepository.findOne({
      where: { id: bankStatementId },
      relations: {
        user: {
          company: true
        },
        userBank: true,
        companyBankAccount: {
          company: true,
          bank: true
        },
        rows: true
      }
    })

    if (!statement) {
      throw new NotFoundException("Extracto bancario no encontrado.")
    }

    this.ensureActorCanAccessBankStatement(actor, statement)

    if (config.company.id !== statement.companyBankAccount.company.id) {
      throw new BadRequestException(
        "La configuracion ERP no pertenece a la empresa del extracto bancario."
      )
    }

    return statement
  }

  private ensureActorCanAccessBankStatement(actor: AuthUser, statement: BankStatement) {
    if (isSuperAdminRole(actor.roleCode)) {
      return
    }

    if (actor.roleCode === Role.ADMIN && statement.user.company.id === actor.companyId) {
      return
    }

    throw new ForbiddenException("No tenes permisos para enviar este extracto al ERP.")
  }

  private toPublicSapSession(
    session: UserErpSession,
    status: PublicSapSessionStatus,
    checkedAt: Date
  ): PublicSapErpSession {
    return {
      companyErpConfigId: session.companyErpConfig.id,
      companyErpConfigName: session.companyErpConfig.name,
      erpType: session.erpType,
      authenticated: status === "active",
      status,
      username: session.username,
      expiresAt: session.expiresAt,
      lastValidatedAt: session.lastValidatedAt,
      checkedAt
    }
  }

  private toPublicSapSessionPlaceholder(
    config: CompanyErpConfig,
    status: PublicSapSessionStatus,
    checkedAt: Date
  ): PublicSapErpSession {
    return {
      companyErpConfigId: config.id,
      companyErpConfigName: config.name,
      erpType: config.erpType,
      authenticated: false,
      status,
      username: null,
      expiresAt: null,
      lastValidatedAt: null,
      checkedAt
    }
  }

  private resolveExternalReconciliationAccountType(
    value: unknown,
    config: CompanyErpConfig
  ): SapExternalReconciliationAccountType {
    const candidate =
      this.normalizeOptional(value) ??
      this.getSettingsString(config, [
        "sapExternalReconciliationAccountType",
        "externalReconciliationAccountType"
      ]) ??
      "rat_GLAccount"

    if ((sapExternalReconciliationAccountTypes as readonly string[]).includes(candidate)) {
      return candidate as SapExternalReconciliationAccountType
    }

    throw new BadRequestException(
      "ReconciliationAccountType debe ser rat_Account, rat_GLAccount o rat_BusinessPartner."
    )
  }

  private normalizeRequired(value: unknown, field: string): string {
    const trimmed = this.normalizeOptional(value)
    if (!trimmed) {
      throw new BadRequestException(`${field} es obligatorio.`)
    }

    return trimmed
  }

  private normalizeOptional(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null
    }

    const trimmed = String(value).trim()
    return trimmed ? trimmed : null
  }

  private resolveSapLoginCredentials(
    config: CompanyErpConfig,
    payload: SapLoginDto
  ): { username: string; password: string } {
    const username = this.normalizeOptional(payload.username) ?? config.userSystem
    const password =
      this.normalizeOptional(payload.password) ??
      (config.userPassEncrypted
        ? decryptText(config.userPassEncrypted, this.credentialSecret)
        : null)

    if (!username) {
      throw new BadRequestException("username es obligatorio.")
    }

    if (!password) {
      throw new BadRequestException("password es obligatorio.")
    }

    return {
      username,
      password
    }
  }

  private readRowText(row: SapReadableRow | null, keys: string[]): string | null {
    if (!row) {
      return null
    }

    for (const key of keys) {
      const value = this.readRowValue(row, key)
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim()
      }
    }

    return null
  }

  private readRowNumber(row: SapReadableRow | null, keys: string[]): number | null {
    if (!row) {
      return null
    }

    for (const key of keys) {
      const value = this.readRowValue(row, key)
      const numberValue = this.toNumber(value)

      if (Number.isFinite(numberValue)) {
        return Math.abs(numberValue)
      }
    }

    return null
  }

  private readRowValue(row: SapReadableRow, key: string): unknown {
    const sources = [row.normalized, row.values]
    const normalizedKey = this.normalizeLookupKey(key)

    for (const source of sources) {
      if (!source) continue

      const direct = source[key]
      if (direct !== undefined && direct !== null) return direct

      const found = Object.entries(source).find(
        ([entryKey]) => this.normalizeLookupKey(entryKey) === normalizedKey
      )
      if (found?.[1] !== undefined && found[1] !== null) return found[1]
    }

    if (this.normalizeLookupKey("rowNumber") === normalizedKey && row.rowNumber !== undefined) {
      return row.rowNumber
    }

    return undefined
  }

  private getSettingsString(config: CompanyErpConfig, keys: string[]): string | null {
    for (const key of keys) {
      const value = this.normalizeOptional(config.settings?.[key])
      if (value) {
        return value
      }
    }

    return null
  }

  private getSettingsBoolean(config: CompanyErpConfig, keys: string[]): boolean {
    for (const key of keys) {
      const value = config.settings?.[key]
      if (typeof value === "boolean") {
        return value
      }

      if (typeof value === "string" && value.trim()) {
        return ["true", "1", "yes", "y", "si"].includes(value.trim().toLowerCase())
      }
    }

    return false
  }

  private toPositiveInteger(value: unknown): number | null {
    const numberValue = this.toNumber(value)

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      return null
    }

    return numberValue
  }

  private toNonNegativeInteger(value: unknown): number | null {
    const numberValue = this.toNumber(value)

    if (!Number.isInteger(numberValue) || numberValue < 0) {
      return null
    }

    return numberValue
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number") {
      return value
    }

    if (typeof value !== "string" || !value.trim()) {
      return Number.NaN
    }

    return Number(value.trim().replace(/\./g, "").replace(",", "."))
  }

  private decryptSessionCookie(value: string | null): string {
    if (!value) {
      throw new BadRequestException("No hay una sesion SAP guardada para este usuario.")
    }

    try {
      return decryptText(value, this.credentialSecret)
    } catch {
      throw new BadRequestException("No se pudo descifrar la sesion SAP guardada.")
    }
  }

  private extractExternalReference(
    payload: Record<string, unknown> | null,
    candidates: string[]
  ): string | null {
    if (!payload) return null

    for (const source of [
      payload,
      this.asRecord(payload.ExternalReconciliation),
      this.asRecord(payload.value)
    ]) {
      if (!source) continue

      for (const key of candidates) {
        const value = source[key]
        if (value !== undefined && value !== null && String(value).trim()) {
          return String(value).trim()
        }
      }
    }

    return null
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null
    }

    return value as Record<string, unknown>
  }

  private normalizeLookupKey(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
  }

  private async logSapExternalReconciliationRequest(
    context: SapExternalReconciliationTraceContext
  ): Promise<void> {
    const logPayload = this.buildSapExternalReconciliationLogPayload(
      "sap_external_reconciliation_request",
      context
    )

    console.log(
      "[SAP_B1][ExternalReconciliation][REQUEST]",
      JSON.stringify(
        {
          endpoint: context.endpoint,
          payload: context.sapPayload
        },
        null,
        2
      )
    )
    this.logger.log(this.stringifyLogPayload(logPayload))
    await this.persistSapExternalReconciliationLog(logPayload)
  }

  private async logSapExternalReconciliationSuccess(
    context: SapExternalReconciliationTraceContext & {
      sapStatusCode: number
      sapResponsePayload: Record<string, unknown> | null
    }
  ): Promise<void> {
    const logPayload = this.buildSapExternalReconciliationLogPayload(
      "sap_external_reconciliation_success",
      context,
      {
        sapStatusCode: context.sapStatusCode,
        sapResponsePayload: context.sapResponsePayload
      }
    )

    console.log("[SAP_B1][ExternalReconciliation][RESPONSE]", {
      endpoint: context.endpoint,
      statusCode: context.sapStatusCode,
      responsePayload: context.sapResponsePayload
    })
    this.logger.log(this.stringifyLogPayload(logPayload))
    await this.persistSapExternalReconciliationLog(logPayload)
  }

  private async logSapExternalReconciliationError(
    error: unknown,
    context: SapExternalReconciliationTraceContext
  ): Promise<void> {
    const errorPayload =
      error instanceof ExternalRequestError
        ? {
            message: error.message,
            statusCode: error.statusCode ?? null,
            responsePayload: error.responsePayload ?? null
          }
        : {
            message: error instanceof Error ? error.message : String(error),
            statusCode: null,
            responsePayload: null,
            stack: error instanceof Error ? error.stack : null
          }

    const logPayload = this.buildSapExternalReconciliationLogPayload(
      "sap_external_reconciliation_failed",
      context,
      {
        sapStatusCode: errorPayload.statusCode,
        sapErrorMessage: errorPayload.message,
        sapResponsePayload: errorPayload.responsePayload,
        stack: "stack" in errorPayload ? errorPayload.stack : null
      }
    )

    console.log(
      "[SAP_B1][ExternalReconciliation][ERROR]",
      JSON.stringify(
        {
          endpoint: context.endpoint,
          statusCode: errorPayload.statusCode,
          message: errorPayload.message,
          responsePayload: errorPayload.responsePayload,
          requestPayload: context.sapPayload
        },
        null,
        2
      )
    )
    this.logger.error(this.stringifyLogPayload(logPayload))
    await this.persistSapExternalReconciliationLog(logPayload)
  }

  private buildSapExternalReconciliationLogPayload(
    event: string,
    context: SapExternalReconciliationTraceContext,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> {
    const reconciliation = this.resolveExternalReconciliationNode(context.sapPayload)

    return {
      event,
      timestamp: new Date().toISOString(),
      actorId: context.actorId,
      companyErpConfigId: context.companyErpConfigId,
      companyErpConfigName: context.companyErpConfigName,
      reconciliationId: context.reconciliationId,
      endpoint: context.endpoint,
      endpointPath: context.endpointPath,
      requestSummary: {
        accountCode: reconciliation.AccountCode ?? context.sapPayload.AccountCode ?? null,
        amount: reconciliation.Amount ?? context.sapPayload.Amount ?? null,
        currencyType: reconciliation.CurrencyType ?? context.sapPayload.CurrencyType ?? null,
        reconciliationAccountType: reconciliation.ReconciliationAccountType,
        bankStatementLines:
          reconciliation.ReconciliationBankStatementLines?.length ?? 0,
        journalEntryLines:
          reconciliation.ReconciliationJournalEntryLines?.length ?? 0
      },
      sapRequestPayload: context.sapPayload,
      ...extra
    }
  }

  private async persistSapExternalReconciliationLog(
    payload: Record<string, unknown>
  ): Promise<void> {
    const logsDir = join(process.cwd(), "logs")
    const logFile = join(logsDir, "sap-external-reconciliations.log")

    try {
      await mkdir(logsDir, { recursive: true })
      await appendFile(logFile, `${JSON.stringify(payload)}\n`, "utf8")
    } catch (error) {
      this.logger.warn(
        `No se pudo guardar el log de conciliacion SAP en ${logFile}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  private stringifyLogPayload(payload: Record<string, unknown>): string {
    const text = JSON.stringify(payload, null, 2)
    const maxLength = 12000

    if (text.length <= maxLength) {
      return text
    }

    return `${text.slice(0, maxLength)}\n... log truncado (${text.length} caracteres totales)`
  }

  private resolveExternalReconciliationNode(
    payload: SapExternalReconciliationPayload | Record<string, unknown>
  ): {
    ReconciliationAccountType?: unknown
    AccountCode?: unknown
    Amount?: unknown
    CurrencyType?: unknown
    ReconciliationBankStatementLines?: unknown[]
    ReconciliationJournalEntryLines?: unknown[]
  } {
    return (this.asRecord(payload.ExternalReconciliation) ?? payload) as {
      ReconciliationAccountType?: unknown
      AccountCode?: unknown
      Amount?: unknown
      CurrencyType?: unknown
      ReconciliationBankStatementLines?: unknown[]
      ReconciliationJournalEntryLines?: unknown[]
    }
  }

  private mapExternalError(error: unknown): {
    message: string
    statusCode?: number
    responsePayload: Record<string, unknown> | null
    exception: HttpException
  } {
    if (error instanceof ExternalRequestError) {
      const responsePayload = error.responsePayload ?? null
      const message = error.message || "No se pudo completar el envio al ERP."
      const statusCode = error.statusCode

      // Timeout / sin respuesta del Service Layer -> 504.
      if (message.toLowerCase().includes("tiempo de espera")) {
        return {
          message,
          statusCode,
          responsePayload,
          exception: new GatewayTimeoutException(message)
        }
      }

      // Rechazo de negocio de SAP (4xx, p.ej. -2028 "No matching records"):
      // los datos enviados no se pudieron procesar. Devolvemos 422 con el
      // mensaje real para que el frontend lo muestre, en vez de un 502 opaco
      // que ademas IIS intercepta y deja sin cabeceras CORS.
      if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
        return {
          message,
          statusCode,
          responsePayload,
          exception: new UnprocessableEntityException(`SAP rechazo la operacion: ${message}`)
        }
      }

      // Error real del Service Layer (5xx) o sin codigo de estado -> 502.
      return {
        message,
        statusCode,
        responsePayload,
        exception: new BadGatewayException(message)
      }
    }

    const fallbackMessage =
      error instanceof Error ? error.message : "No se pudo completar el envio al ERP."

    return {
      message: fallbackMessage,
      responsePayload: null,
      exception: new BadGatewayException(fallbackMessage)
    }
  }
}
