import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { QueryFailedError, Repository } from "typeorm"
import { PublicCompany } from "../access-control/interfaces/access-control.interfaces"
import { Company } from "../access-control/entities/company.entity"
import { Role } from "../common/enums/role.enum"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { ErpType } from "../common/enums/erp-type.enum"
import { decryptText, encryptText } from "../common/utils/encryption.util"
import { isGestorRole, isSuperAdminRole } from "../common/utils/role.util"
import { Reconciliation } from "../conciliation/entities/reconciliation.entity"
import { User } from "../users/entities/user.entity"
import { CreateCompanyErpConfigDto } from "./dto/create-company-erp-config.dto"
import { ListCompanyErpConfigsQueryDto } from "./dto/list-company-erp-configs-query.dto"
import { SendSapDepositDto } from "./dto/send-sap-deposit.dto"
import { UpdateCompanyErpConfigDto } from "./dto/update-company-erp-config.dto"
import { CompanyErpConfig } from "./entities/company-erp-config.entity"
import { UserErpSession } from "./entities/user-erp-session.entity"
import {
  ErpReferenceResponse,
  PublicCompanyErpConfig,
  PublicErpShipmentResult,
  PublicSapErpSession,
  PublicSapSessionStatus
} from "./interfaces/erp.interfaces"
import { SapLoginDto } from "./sap/dto/sap-login.dto"
import { ExternalRequestError, SapB1Service } from "./sap/sap-b1.service"

@Injectable()
export class ErpService {
  private readonly credentialSecret: string

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

  async listReference(actor: AuthUser): Promise<ErpReferenceResponse> {
    const companies = await this.listCompaniesForActor(actor)
    return {
      companies: companies.map((company) => this.toPublicCompany(company)),
      erpTypes: [
        {
          code: ErpType.SAP_B1,
          label: "SAP Business One"
        }
      ],
      tlsVersions: ["1.0", "1.1", "1.2", "1.3"]
    }
  }

  async listCompanyErpConfigs(
    actor: AuthUser,
    query: ListCompanyErpConfigsQueryDto
  ): Promise<PublicCompanyErpConfig[]> {
    const companyId = await this.resolveAccessibleCompanyId(actor, query.companyId)

    const queryBuilder = this.companyErpConfigRepository
      .createQueryBuilder("config")
      .leftJoinAndSelect("config.company", "company")
      .where("company.id = :companyId", { companyId })
      .orderBy("config.isDefault", "DESC")
      .addOrderBy("config.active", "DESC")
      .addOrderBy("config.name", "ASC")
      .addOrderBy("config.id", "ASC")

    if (query.activeOnly) {
      queryBuilder.andWhere("config.active = :active", { active: true })
    }

    const configs = await queryBuilder.getMany()
    return configs.map((config) => this.toPublicCompanyErpConfig(config))
  }

  async createCompanyErpConfig(
    payload: CreateCompanyErpConfigDto,
    actor: AuthUser
  ): Promise<PublicCompanyErpConfig> {
    this.ensureSuperadmin(actor)

    const company = await this.requireCompany(payload.companyId)
    const existingCount = await this.companyErpConfigRepository.count({
      where: { company: { id: company.id } }
    })

    const nextIsDefault = payload.isDefault ?? existingCount === 0
    const nextActive = payload.active ?? true
    if (nextIsDefault && !nextActive) {
      throw new BadRequestException("Una configuracion predeterminada no puede quedar inactiva.")
    }

    const preparedPassword = this.normalizeOptional(payload.password)
    const erpConfig = this.companyErpConfigRepository.create({
      company,
      code: this.normalizeCode(payload.code),
      name: this.normalizeRequired(payload.name, "name"),
      erpType: payload.erpType ?? ErpType.SAP_B1,
      description: this.normalizeOptional(payload.description),
      active: nextActive,
      isDefault: nextIsDefault,
      sapUsername: this.normalizeOptional(payload.sapUsername),
      dbName: this.normalizeOptional(payload.dbName),
      cmpName: this.normalizeOptional(payload.cmpName),
      serverNode: this.normalizeOptional(payload.serverNode),
      dbUser: this.normalizeOptional(payload.dbUser),
      dbPasswordEncrypted: preparedPassword
        ? encryptText(preparedPassword, this.credentialSecret)
        : null,
      serviceLayerUrl: this.normalizeUrl(payload.serviceLayerUrl),
      tlsVersion: this.normalizeOptional(payload.tlsVersion),
      allowSelfSigned: payload.allowSelfSigned ?? false,
      settings: this.toJsonRecord(payload.settings)
    })

    this.ensureSupportedErpType(erpConfig.erpType)
    this.validateSapConfig(erpConfig, false)

    try {
      return this.companyErpConfigRepository.manager.transaction(async (manager) => {
        if (erpConfig.isDefault) {
          await this.clearDefaultConfigForCompany(manager.getRepository(CompanyErpConfig), company.id)
        }

        const saved = await manager.getRepository(CompanyErpConfig).save(erpConfig)
        const persisted = await manager.getRepository(CompanyErpConfig).findOne({
          where: { id: saved.id },
          relations: { company: true }
        })

        if (!persisted) {
          throw new NotFoundException("No se pudo recuperar la configuracion ERP creada.")
        }

        return this.toPublicCompanyErpConfig(persisted)
      })
    } catch (error) {
      this.handleDatabaseError(error)
    }
  }

  async updateCompanyErpConfig(
    configId: number,
    payload: UpdateCompanyErpConfigDto,
    actor: AuthUser
  ): Promise<PublicCompanyErpConfig> {
    this.ensureSuperadmin(actor)

    return this.companyErpConfigRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(CompanyErpConfig)
      const config = await repository.findOne({
        where: { id: configId },
        relations: { company: true }
      })

      if (!config) {
        throw new NotFoundException("Configuracion ERP no encontrada.")
      }

      if (payload.companyId !== undefined && payload.companyId !== config.company.id) {
        config.company = await this.requireCompany(payload.companyId)
      }

      if (payload.code !== undefined) config.code = this.normalizeCode(payload.code)
      if (payload.name !== undefined) config.name = this.normalizeRequired(payload.name, "name")
      if (payload.description !== undefined) {
        config.description = this.normalizeOptional(payload.description)
      }
      if (payload.erpType !== undefined) {
        config.erpType = payload.erpType
      }
      if (payload.active !== undefined) config.active = payload.active
      if (payload.isDefault !== undefined) config.isDefault = payload.isDefault
      if (payload.sapUsername !== undefined) {
        config.sapUsername = this.normalizeOptional(payload.sapUsername)
      }
      if (payload.dbName !== undefined) config.dbName = this.normalizeOptional(payload.dbName)
      if (payload.cmpName !== undefined) config.cmpName = this.normalizeOptional(payload.cmpName)
      if (payload.serverNode !== undefined) {
        config.serverNode = this.normalizeOptional(payload.serverNode)
      }
      if (payload.dbUser !== undefined) config.dbUser = this.normalizeOptional(payload.dbUser)
      if (payload.serviceLayerUrl !== undefined) {
        config.serviceLayerUrl = this.normalizeUrl(payload.serviceLayerUrl)
      }
      if (payload.tlsVersion !== undefined) {
        config.tlsVersion = this.normalizeOptional(payload.tlsVersion)
      }
      if (payload.allowSelfSigned !== undefined) {
        config.allowSelfSigned = payload.allowSelfSigned
      }
      if (payload.settings !== undefined) {
        config.settings = this.toJsonRecord(payload.settings)
      }

      const preparedPassword = this.normalizeOptional(payload.password)
      if (preparedPassword) {
        config.dbPasswordEncrypted = encryptText(preparedPassword, this.credentialSecret)
      }

      this.ensureSupportedErpType(config.erpType)
      if (config.isDefault && !config.active) {
        throw new BadRequestException("Una configuracion predeterminada no puede quedar inactiva.")
      }

      this.validateSapConfig(config, false)

      try {
        if (config.isDefault) {
          await repository
            .createQueryBuilder()
            .update(CompanyErpConfig)
            .set({ isDefault: false })
            .where("emp_id = :companyId AND epc_id <> :configId", {
              companyId: config.company.id,
              configId: config.id
            })
            .execute()
        }

        await repository.save(config)
      } catch (error) {
        this.handleDatabaseError(error)
      }

      const persisted = await repository.findOne({
        where: { id: config.id },
        relations: { company: true }
      })

      if (!persisted) {
        throw new NotFoundException("No se pudo recuperar la configuracion ERP actualizada.")
      }

      return this.toPublicCompanyErpConfig(persisted)
    })
  }

  async loginSapSession(actor: AuthUser, payload: SapLoginDto): Promise<PublicSapErpSession> {
    const [config, user] = await Promise.all([
      this.requireConfigForActor(actor, payload.companyErpConfigId),
      this.userRepository.findOne({ where: { id: actor.id } })
    ])

    if (!user) {
      throw new NotFoundException("Usuario no encontrado.")
    }

    this.ensureSupportedErpType(config.erpType)
    this.validateSapConfig(config, false)
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

  async sendSapDeposit(actor: AuthUser, payload: SendSapDepositDto): Promise<PublicErpShipmentResult> {
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
          layout: true
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

    this.ensureSupportedErpType(config.erpType)
    this.validateSapConfig(config, false)
    this.ensureActiveConfig(config)

    const session = await this.requireActiveSapSession(actor, config)
    const endpoint = this.sapB1Service.joinUrl(config.serviceLayerUrl, "Deposits")

    try {
      const cookieHeader = this.decryptSessionCookie(session.sessionCookieEncrypted)
      const sapResponse = await this.sapB1Service.postDeposit(config, cookieHeader, payload.payload)
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

  private async listCompaniesForActor(actor: AuthUser): Promise<Company[]> {
    if (isSuperAdminRole(actor.roleCode)) {
      return this.companyRepository.find({
        order: { name: "ASC", id: "ASC" }
      })
    }

    const company = await this.companyRepository.findOne({
      where: { id: actor.companyId }
    })

    return company ? [company] : []
  }

  private async resolveAccessibleCompanyId(
    actor: AuthUser,
    requestedCompanyId?: number
  ): Promise<number> {
    if (isSuperAdminRole(actor.roleCode)) {
      const resolved = requestedCompanyId ?? actor.companyId
      if (!resolved) {
        throw new BadRequestException("companyId es obligatorio para el super admin.")
      }

      await this.requireCompany(resolved)
      return resolved
    }

    if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
      throw new ForbiddenException("No podes consultar configuraciones ERP de otra empresa.")
    }

    return actor.companyId
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

  private async requireCompany(companyId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId }
    })
    if (!company) {
      throw new NotFoundException("Empresa no encontrada.")
    }

    return company
  }

  private ensureSuperadmin(actor: AuthUser) {
    if (!isSuperAdminRole(actor.roleCode)) {
      throw new ForbiddenException("Solo el super admin puede administrar configuraciones ERP.")
    }
  }

  private ensureSupportedErpType(erpType: ErpType) {
    if (erpType !== ErpType.SAP_B1) {
      throw new BadRequestException("Por ahora solo esta soportado SAP Business One.")
    }
  }

  private validateSapConfig(config: CompanyErpConfig, requirePassword: boolean) {
    const requiredFields: Array<[string | null, string]> = [
      [config.dbName, "dbName"],
      [config.serviceLayerUrl, "serviceLayerUrl"],
      [config.tlsVersion, "tlsVersion"]
    ]

    for (const [value, label] of requiredFields) {
      if (!this.normalizeOptional(value)) {
        throw new BadRequestException(`El campo ${label} es obligatorio para SAP B1.`)
      }
    }

    if (requirePassword && !config.dbPasswordEncrypted) {
      throw new BadRequestException("Debes cargar la password para SAP B1.")
    }
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

  private async clearDefaultConfigForCompany(
    repository: Repository<CompanyErpConfig>,
    companyId: number
  ) {
    await repository
      .createQueryBuilder()
      .update(CompanyErpConfig)
      .set({ isDefault: false })
      .where("emp_id = :companyId", { companyId })
      .execute()
  }

  private toPublicCompany(company: Company): PublicCompany {
    return {
      id: company.id,
      code: company.code,
      fiscalId: company.code,
      name: company.name,
      active: company.active,
      webserviceErp: company.webserviceErp,
      schemeErp: company.schemeErp,
      tlsVersionErp: company.tlsVersionErp,
      cardsId: company.cardsId
    }
  }

  private toPublicCompanyErpConfig(config: CompanyErpConfig): PublicCompanyErpConfig {
    return {
      id: config.id,
      companyId: config.company.id,
      companyCode: config.company.code,
      companyName: config.company.name,
      code: config.code,
      name: config.name,
      erpType: config.erpType,
      description: config.description,
      active: config.active,
      isDefault: config.isDefault,
      sapUsername: config.sapUsername,
      dbName: config.dbName,
      cmpName: config.cmpName,
      serverNode: config.serverNode,
      dbUser: config.dbUser,
      serviceLayerUrl: config.serviceLayerUrl,
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned,
      settings: config.settings,
      hasPassword: Boolean(config.dbPasswordEncrypted),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    }
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

  private normalizeOptional(value?: string | null): string | null {
    if (value === undefined || value === null) return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private normalizeCode(value: string): string {
    return this.normalizeRequired(value, "code").toUpperCase().replace(/\s+/g, "_")
  }

  private normalizeUrl(value?: string | null): string | null {
    const normalized = this.normalizeOptional(value)
    if (!normalized) return null
    return normalized.replace(/\/+$/, "")
  }

  private toJsonRecord(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null
    }

    if (typeof value !== "object") {
      return { value }
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
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

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & {
        driverError?: { code?: string; detail?: string; constraint?: string }
      }).driverError

      if (driverError?.code === "23505") {
        const constraint = String(driverError.constraint ?? "").toLowerCase()
        const detail = String(driverError.detail ?? "").toLowerCase()

        if (constraint.includes("uq_empresas_erp_configuraciones_codigo") || detail.includes("epc_codigo")) {
          throw new ConflictException("Ya existe una configuracion ERP con ese codigo en la empresa.")
        }

        if (constraint.includes("uq_empresas_erp_configuraciones_default")) {
          throw new ConflictException("Solo puede haber una configuracion ERP predeterminada por empresa.")
        }

        throw new ConflictException("Ya existe un registro con esos datos unicos.")
      }
    }

    throw error
  }
}
