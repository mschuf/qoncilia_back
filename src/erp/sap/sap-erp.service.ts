import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CompanyErpConfig } from "../entities/company-erp-config.entity"
import { Role } from "../../common/enums/role.enum"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { decryptText, encryptText } from "../../common/utils/encryption.util"
import { isGestorRole, isSuperAdminRole } from "../../common/utils/role.util"
import { BankStatement } from "../../conciliation/entities/bank-statement.entity"
import { BankStatementRow } from "../../conciliation/entities/bank-statement-row.entity"
import { Reconciliation } from "../../conciliation/entities/reconciliation.entity"
import { User } from "../../users/entities/user.entity"
import { SapLoginDto } from "./dto/sap-login.dto"
import { SapCreditDepositLineDto, SendSapDepositDto } from "./dto/send-sap-deposit.dto"
import { UserErpSession } from "./entities/user-erp-session.entity"
import {
  PublicSapErpSession,
  PublicSapErpShipmentResult,
  PublicSapSessionStatus,
  SapCreditDepositLinePayload,
  SapCreditDepositPayload
} from "./interfaces/sap-erp.interfaces"
import { ExternalRequestError, SapB1Service } from "./sap-b1.service"
import { ensureSapErpType, validateSapConfig } from "./sap-config.validator"

@Injectable()
export class SapErpService {
  private readonly credentialSecret: string

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BankStatement)
    private readonly bankStatementRepository: Repository<BankStatement>,
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
      const loginResult = await this.sapB1Service.login(config, {
        username: this.normalizeRequired(payload.username, "username"),
        password: payload.password
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
      session.username = this.normalizeRequired(payload.username, "username")
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

  async sendSapDeposit(
    actor: AuthUser,
    payload: SendSapDepositDto
  ): Promise<PublicSapErpShipmentResult> {
    const config = await this.requireConfigForActor(actor, payload.companyErpConfigId)
    const sender = await this.userRepository.findOne({
      where: { id: actor.id }
    })

    if (!sender) {
      throw new NotFoundException("Usuario ejecutor no encontrado.")
    }

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
    const endpoint = this.sapB1Service.joinUrl(config.serviceLayerUrl, "Deposits")
    const depositPayload = await this.resolveSapDepositPayload(
      actor,
      config,
      payload,
      reconciliation
    )

    try {
      const cookieHeader = this.decryptSessionCookie(session.sessionCookieEncrypted)
      const sapResponse = await this.sapB1Service.postDeposit(config, cookieHeader, depositPayload)
      const now = new Date()
      session.lastValidatedAt = now
      await this.userErpSessionRepository.save(session)

      return {
        id: 0,
        reconciliationId: reconciliation?.id ?? null,
        companyErpConfigId: config.id,
        companyErpConfigName: config.name,
        documentType: "deposit",
        status: "success",
        endpoint,
        httpStatus: sapResponse.statusCode,
        responsePayload: sapResponse.bodyJson,
        errorMessage: null,
        externalDocEntry: this.extractExternalReference(
          sapResponse.bodyJson,
          ["DocEntry", "AbsoluteEntry", "AbsEntry"]
        ),
        externalDocNum: this.extractExternalReference(
          sapResponse.bodyJson,
          ["DepositNumber", "DepositsNumber", "DocNum"]
        ),
        createdAt: now,
        updatedAt: now
      }
    } catch (error) {
      if (error instanceof ExternalRequestError && [401, 403].includes(error.statusCode ?? 0)) {
        session.invalidatedAt = new Date()
        await this.userErpSessionRepository.save(session)
      }

      const mapped = this.mapExternalError(error)
      throw mapped.exception
    }
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
      throw new BadRequestException("Debes iniciar sesion en SAP antes de enviar el deposito.")
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

    if (isGestorRole(actor.roleCode) && reconciliation.user.id === actor.id) {
      return
    }

    throw new ForbiddenException("No tenes permisos para enviar esta conciliacion al ERP.")
  }

  private async resolveSapDepositPayload(
    actor: AuthUser,
    config: CompanyErpConfig,
    payload: SendSapDepositDto,
    reconciliation: Reconciliation | null
  ): Promise<Record<string, unknown>> {
    if (payload.payload) {
      return this.normalizeRawSapDepositPayload(payload.payload)
    }

    return this.buildSapCreditDepositPayload(actor, config, payload, reconciliation)
  }

  private normalizeRawSapDepositPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (payload.DepositType !== "dtCredit") {
      return payload
    }

    const checkLines = payload.CheckLines
    if (Array.isArray(checkLines) && checkLines.length > 0) {
      throw new BadRequestException(
        "Los depositos de tarjeta deben enviarse en CreditLines, no en CheckLines."
      )
    }

    const creditLines = payload.CreditLines
    if (!Array.isArray(creditLines) || creditLines.length === 0) {
      throw new BadRequestException("El deposito de tarjeta debe tener CreditLines.")
    }

    return {
      ...payload,
      DepositType: "dtCredit",
      CheckLines: [],
      BOELines: Array.isArray(payload.BOELines) ? payload.BOELines : []
    }
  }

  private async buildSapCreditDepositPayload(
    actor: AuthUser,
    config: CompanyErpConfig,
    payload: SendSapDepositDto,
    reconciliation: Reconciliation | null
  ): Promise<SapCreditDepositPayload> {
    const inputLines = payload.creditLines ?? []
    if (inputLines.length === 0) {
      throw new BadRequestException(
        "Debes enviar creditLines o un payload SAP crudo para crear el deposito."
      )
    }

    const statement = payload.bankStatementId
      ? await this.requireBankStatementForDeposit(actor, config, payload.bankStatementId)
      : null
    const account = statement?.companyBankAccount ?? reconciliation?.companyBankAccount ?? null
    const userBank = statement?.userBank ?? reconciliation?.userBank ?? null

    if (!account) {
      throw new BadRequestException(
        "Para generar el deposito SAP debes enviar bankStatementId o reconciliationId."
      )
    }

    if (config.company.id !== account.company.id) {
      throw new BadRequestException(
        "La configuracion ERP no pertenece a la empresa de la cuenta bancaria."
      )
    }

    const depositAccount = this.normalizeRequired(
      account.majorAccountNumber,
      "cuenta mayor de la cuenta bancaria"
    )
    const voucherAccount = this.normalizeRequired(
      account.paymentAccountNumber ?? "",
      "cuenta de pago de la cuenta bancaria"
    )
    const currency = this.toSapCurrency(payload.depositCurrency ?? account.currency)
    const rowsBySourceId = new Map<string, BankStatementRow>()
    const rowsByDbId = new Map<number, BankStatementRow>()

    for (const row of statement?.rows ?? []) {
      rowsBySourceId.set(row.sourceRowId, row)
      rowsByDbId.set(row.id, row)
    }

    const creditLines = inputLines.map((line, index) =>
      this.buildSapCreditLine(line, index, payload, config, currency, rowsBySourceId, rowsByDbId)
    )
    const totalLC = this.roundMoney(
      creditLines.reduce((total, line) => total + Number(line.Total || 0), 0)
    )
    const firstPayDate = creditLines[0]?.PayDate ?? this.toSapDate(new Date())
    const depositDate =
      this.toSapDate(payload.depositDate) ??
      this.toSapDate(new Date()) ??
      firstPayDate ??
      new Date().toISOString()
    const bankReference =
      this.normalizeOptional(payload.bankReference) ??
      this.formatSapReferenceDate(firstPayDate) ??
      statement?.name ??
      reconciliation?.name ??
      ""
    const journalRemarks = this.truncate(
      this.normalizeOptional(payload.journalRemarks) ??
        `Conciliacion ${statement?.name ?? reconciliation?.name ?? bankReference}`,
      254
    )
    const bankName =
      this.normalizeOptional(account.bankErpId) ??
      this.normalizeOptional(userBank?.alias) ??
      this.normalizeOptional(userBank?.name) ??
      ""

    return {
      DepositType: "dtCredit",
      DepositDate: depositDate,
      DepositCurrency: currency,
      DepositAccount: depositAccount,
      DepositorName: null,
      Bank: bankName,
      BankAccountNum: account.accountNumber ?? "",
      BankBranch: userBank?.branch ?? "",
      BankReference: this.truncate(bankReference, 80),
      JournalRemarks: journalRemarks,
      TotalLC: totalLC,
      TotalFC: 0,
      TotalSC: 0,
      AllocationAccount: "",
      DocRate: 0,
      TaxAccount: "",
      TaxAmount: 0,
      CommissionAccount: null,
      Commission: 0,
      CommissionDate: null,
      TaxCode: "",
      DepositAccountType: "datBankAccount",
      ReconcileAfterDeposit: "tYES",
      VoucherAccount: voucherAccount,
      Series: this.getSettingsNumber(config, ["sapDepositSeries", "depositSeries"]),
      Project: null,
      DistributionRule: null,
      DistributionRule2: null,
      DistributionRule3: null,
      DistributionRule4: null,
      DistributionRule5: null,
      CommissionCurrency: currency,
      CommissionSC: 0,
      CommissionFC: 0,
      TaxAmountSC: 0,
      TaxAmountFC: 0,
      BPLID: this.getSettingsNumber(config, ["sapBplId", "bplId"]),
      CheckDepositType: "cdtCashChecks",
      AttachmentEntry: null,
      IncomeTaxAccount: null,
      IncomeTaxAmount: 0,
      IncomeTaxAmountSC: 0,
      IncomeTaxAmountFC: 0,
      CheckLines: [],
      CreditLines: creditLines,
      BOELines: []
    }
  }

  private buildSapCreditLine(
    input: SapCreditDepositLineDto,
    index: number,
    request: SendSapDepositDto,
    config: CompanyErpConfig,
    fallbackCurrency: string,
    rowsBySourceId: Map<string, BankStatementRow>,
    rowsByDbId: Map<number, BankStatementRow>
  ): SapCreditDepositLinePayload {
    const bankRow =
      (input.bankStatementRowId ? rowsByDbId.get(input.bankStatementRowId) : null) ??
      (input.bankRowId ? rowsBySourceId.get(input.bankRowId) : null) ??
      null
    const creditCard =
      input.creditCard ??
      request.creditCard ??
      this.getSettingsNumber(config, ["sapCreditCardId", "sapCreditCard", "creditCardId"]) ??
      this.toPositiveInteger(config.company.cardsId)
    const paymentMethodCode =
      input.paymentMethodCode ??
      request.paymentMethodCode ??
      this.getSettingsNumber(config, [
        "sapPaymentMethodCode",
        "paymentMethodCode",
        "defaultPaymentMethodCode"
      ]) ??
      2
    const voucherNumber =
      this.normalizeOptional(input.voucherNumber) ??
      this.normalizeOptional(input.ref3) ??
      this.readRowText(bankRow, ["ref3", "voucherNumber", "comprobante", "referencia", "reference"]) ??
      input.bankRowId ??
      bankRow?.sourceRowId ??
      String(index + 1)
    const payDate =
      this.toSapDate(input.payDate) ??
      this.toSapDate(this.readRowText(bankRow, ["fecha", "payDate", "date"])) ??
      this.toSapDate(new Date()) ??
      new Date().toISOString()
    const customer =
      this.normalizeOptional(input.customer) ??
      this.normalizeOptional(request.defaultCustomer) ??
      this.readRowText(bankRow, [
        "customer",
        "cliente",
        "cardCode",
        "codigoCliente",
        "codigo_cliente"
      ])
    const total = input.total ?? this.readRowNumber(bankRow, ["monto", "amount", "total"])
    const creditCurrency = this.toSapCurrency(input.creditCurrency ?? fallbackCurrency)

    if (!creditCard) {
      throw new BadRequestException(
        "No se encontro CreditCard para el deposito SAP. Configuralo en el ERP, en la empresa o envialo en la linea."
      )
    }

    if (!customer) {
      throw new BadRequestException(
        `No se encontro Customer para la linea ${index + 1} del deposito SAP.`
      )
    }

    if (total === null || total <= 0) {
      throw new BadRequestException(
        `No se encontro un monto valido para la linea ${index + 1} del deposito SAP.`
      )
    }

    return {
      AbsId: input.absId ?? index + 1,
      CreditCard: creditCard,
      VoucherNumber: this.truncate(voucherNumber, 80),
      PaymentMethodCode: paymentMethodCode,
      PayDate: payDate,
      Deposited: "tNO",
      NumOfPayments: 1,
      Customer: this.truncate(customer, 80),
      Reference: this.normalizeOptional(input.reference),
      Transferred: "tNO",
      Total: this.roundMoney(total),
      CreditCurrency: creditCurrency
    }
  }

  private async requireBankStatementForDeposit(
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

    if (isGestorRole(actor.roleCode) && statement.user.id === actor.id) {
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

  private normalizeRequired(value: string, field: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
      throw new BadRequestException(`${field} es obligatorio.`)
    }

    return trimmed
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null
    }

    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  private toSapCurrency(value: string | null | undefined): string {
    const normalized = this.normalizeOptional(value)?.toUpperCase() ?? "GS"
    return ["PYG", "GUARANI", "GUARANIES"].includes(normalized) ? "GS" : normalized
  }

  private toSapDate(value: Date | string | null | undefined): string | null {
    if (value instanceof Date) {
      return `${value.toISOString().slice(0, 10)}T00:00:00Z`
    }

    const text = this.normalizeOptional(value)
    if (!text) {
      return null
    }

    const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/)
    if (dateOnly) {
      return `${dateOnly[1]}T00:00:00Z`
    }

    const parsed = Date.parse(text)
    if (Number.isNaN(parsed)) {
      return null
    }

    return `${new Date(parsed).toISOString().slice(0, 10)}T00:00:00Z`
  }

  private formatSapReferenceDate(value: string | null): string | null {
    const sapDate = this.toSapDate(value)
    if (!sapDate) {
      return null
    }

    const [year, month, day] = sapDate.slice(0, 10).split("-")
    return `${day}.${month}.${year}`
  }

  private readRowText(row: BankStatementRow | null, keys: string[]): string | null {
    if (!row) {
      return null
    }

    for (const key of keys) {
      const value = row.normalized?.[key] ?? row.values?.[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value)
      }
    }

    return null
  }

  private readRowNumber(row: BankStatementRow | null, keys: string[]): number | null {
    if (!row) {
      return null
    }

    for (const key of keys) {
      const value = row.normalized?.[key] ?? row.values?.[key]
      const numberValue =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number(value.replace(/\./g, "").replace(",", "."))
            : Number.NaN

      if (Number.isFinite(numberValue)) {
        return Math.abs(numberValue)
      }
    }

    return null
  }

  private getSettingsNumber(config: CompanyErpConfig, keys: string[]): number | null {
    for (const key of keys) {
      const parsed = this.toPositiveInteger(config.settings?.[key])
      if (parsed) {
        return parsed
      }
    }

    return null
  }

  private toPositiveInteger(value: unknown): number | null {
    const numberValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value.trim())
          : Number.NaN

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      return null
    }

    return numberValue
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value
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

    for (const key of candidates) {
      const value = payload[key]
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim()
      }
    }

    return null
  }

  private mapExternalError(error: unknown): {
    message: string
    statusCode?: number
    responsePayload: Record<string, unknown> | null
    exception: BadGatewayException | GatewayTimeoutException
  } {
    if (error instanceof ExternalRequestError) {
      const responsePayload = error.responsePayload ?? null
      const message = error.message || "No se pudo completar el envio al ERP."
      if (message.toLowerCase().includes("tiempo de espera")) {
        return {
          message,
          statusCode: error.statusCode,
          responsePayload,
          exception: new GatewayTimeoutException(message)
        }
      }

      return {
        message,
        statusCode: error.statusCode,
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
