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
import * as http from "http"
import * as https from "https"
import { IncomingHttpHeaders } from "http"
import { URL } from "url"
import { QueryFailedError, Repository } from "typeorm"
import { PublicCompany } from "../access-control/interfaces/access-control.interfaces"
import { Company } from "../access-control/entities/company.entity"
import { Role } from "../common/enums/role.enum"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { ErpType } from "../common/enums/erp-type.enum"
import { decryptText, encryptText } from "../common/utils/encryption.util"
import { isSuperAdminRole } from "../common/utils/role.util"
import { Reconciliation } from "../conciliation/entities/reconciliation.entity"
import { User } from "../users/entities/user.entity"
import { CreateCompanyErpConfigDto } from "./dto/create-company-erp-config.dto"
import { ListCompanyErpConfigsQueryDto } from "./dto/list-company-erp-configs-query.dto"
import { SendSapDepositDto } from "./dto/send-sap-deposit.dto"
import { UpdateCompanyErpConfigDto } from "./dto/update-company-erp-config.dto"
import { CompanyErpConfig } from "./entities/company-erp-config.entity"
import { ReconciliationErpShipment } from "./entities/reconciliation-erp-shipment.entity"
import {
  ErpReferenceResponse,
  PublicCompanyErpConfig,
  PublicErpShipmentResult
} from "./interfaces/erp.interfaces"

type JsonRequestResponse = {
  statusCode: number
  headers: IncomingHttpHeaders
  bodyText: string
  bodyJson: Record<string, unknown> | null
}

class ExternalRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responsePayload?: Record<string, unknown> | null
  ) {
    super(message)
    this.name = "ExternalRequestError"
  }
}

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
    @InjectRepository(ReconciliationErpShipment)
    private readonly reconciliationErpShipmentRepository: Repository<ReconciliationErpShipment>,
    configService: ConfigService
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
    this.validateSapConfig(erpConfig, true)

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

      this.validateSapConfig(config, !Boolean(config.dbPasswordEncrypted))

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

  async sendSapDeposit(actor: AuthUser, payload: SendSapDepositDto): Promise<PublicErpShipmentResult> {
    if (actor.roleCode !== Role.ADMIN && !isSuperAdminRole(actor.roleCode)) {
      throw new ForbiddenException("Solo admin y super admin pueden enviar depositos al ERP.")
    }

    const [reconciliation, config, sender] = await Promise.all([
      this.reconciliationRepository.findOne({
        where: { id: payload.reconciliationId },
        relations: {
          user: {
            company: true
          },
          userBank: true,
          layout: true
        }
      }),
      this.companyErpConfigRepository.findOne({
        where: { id: payload.companyErpConfigId },
        relations: { company: true }
      }),
      this.userRepository.findOne({
        where: { id: actor.id }
      })
    ])

    if (!reconciliation) {
      throw new NotFoundException("Conciliacion no encontrada.")
    }
    if (!config) {
      throw new NotFoundException("Configuracion ERP no encontrada.")
    }
    if (!sender) {
      throw new NotFoundException("Usuario ejecutor no encontrado.")
    }

    this.ensureActorCanAccessReconciliation(actor, reconciliation)

    if (!config.active) {
      throw new BadRequestException("La configuracion ERP seleccionada esta inactiva.")
    }

    if (config.company.id !== reconciliation.user.company.id) {
      throw new BadRequestException(
        "La configuracion ERP no pertenece a la misma empresa de la conciliacion."
      )
    }

    this.ensureSupportedErpType(config.erpType)
    this.validateSapConfig(config, false)

    const endpoint = this.joinUrl(config.serviceLayerUrl, "Deposits")
    const shipment = await this.reconciliationErpShipmentRepository.save(
      this.reconciliationErpShipmentRepository.create({
        reconciliation,
        companyErpConfig: config,
        sender,
        documentType: "deposit",
        status: "pending",
        endpoint,
        requestPayload: this.toJsonRecord(payload.payload)
      })
    )

    try {
      const sapResponse = await this.postSapDeposit(config, payload.payload)

      shipment.status = "success"
      shipment.httpStatus = sapResponse.statusCode
      shipment.responsePayload = sapResponse.bodyJson
      shipment.errorMessage = null
      shipment.externalDocEntry = this.extractExternalReference(
        sapResponse.bodyJson,
        ["DocEntry", "AbsoluteEntry"]
      )
      shipment.externalDocNum = this.extractExternalReference(
        sapResponse.bodyJson,
        ["DepositNumber", "DepositsNumber", "DocNum"]
      )

      const persisted = await this.reconciliationErpShipmentRepository.save(shipment)
      return this.toPublicErpShipmentResult(persisted, config.name)
    } catch (error) {
      const mapped = this.mapExternalError(error)
      shipment.status = "error"
      shipment.httpStatus = mapped.statusCode ?? null
      shipment.responsePayload = mapped.responsePayload
      shipment.errorMessage = mapped.message
      shipment.externalDocEntry = null
      shipment.externalDocNum = null

      await this.reconciliationErpShipmentRepository.save(shipment)
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
      [config.sapUsername, "sapUsername"],
      [config.dbName, "dbName"],
      [config.cmpName, "cmpName"],
      [config.serverNode, "serverNode"],
      [config.dbUser, "dbUser"],
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

  private toPublicErpShipmentResult(
    shipment: ReconciliationErpShipment,
    companyErpConfigName: string
  ): PublicErpShipmentResult {
    return {
      id: shipment.id,
      reconciliationId: shipment.reconciliation.id,
      companyErpConfigId: shipment.companyErpConfig.id,
      companyErpConfigName,
      documentType: shipment.documentType,
      status: shipment.status,
      endpoint: shipment.endpoint,
      httpStatus: shipment.httpStatus,
      responsePayload: shipment.responsePayload,
      errorMessage: shipment.errorMessage,
      externalDocEntry: shipment.externalDocEntry,
      externalDocNum: shipment.externalDocNum,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt
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

  private joinUrl(baseUrl: string | null, path: string): string {
    if (!baseUrl) {
      throw new BadRequestException("La configuracion ERP no tiene serviceLayerUrl.")
    }

    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
  }

  private async postSapDeposit(
    config: CompanyErpConfig,
    payload: Record<string, unknown>
  ): Promise<JsonRequestResponse> {
    const loginResponse = await this.performJsonRequest(this.joinUrl(config.serviceLayerUrl, "Login"), {
      method: "POST",
      body: {
        CompanyDB: config.dbName,
        UserName: config.sapUsername ?? config.dbUser,
        Password: this.decryptCredential(config.dbPasswordEncrypted)
      },
      headers: {
        Accept: "application/json"
      },
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned
    })

    const cookieHeader = this.buildCookieHeader(loginResponse.headers["set-cookie"])
    if (!cookieHeader) {
      throw new ExternalRequestError("SAP no devolvio una sesion valida al autenticar.")
    }

    return this.performJsonRequest(this.joinUrl(config.serviceLayerUrl, "Deposits"), {
      method: "POST",
      body: payload,
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader
      },
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned
    })
  }

  private decryptCredential(value: string | null): string {
    if (!value) {
      throw new BadRequestException("La configuracion ERP no tiene password guardada.")
    }

    try {
      return decryptText(value, this.credentialSecret)
    } catch {
      throw new BadRequestException("No se pudo descifrar la password del ERP configurado.")
    }
  }

  private buildCookieHeader(setCookieHeader?: string[] | string): string {
    const entries = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : typeof setCookieHeader === "string"
        ? [setCookieHeader]
        : []

    return entries
      .map((item) => item.split(";")[0]?.trim())
      .filter((item): item is string => Boolean(item))
      .join("; ")
  }

  private async performJsonRequest(
    targetUrl: string,
    options: {
      method: "POST" | "GET"
      body?: Record<string, unknown>
      headers?: Record<string, string>
      tlsVersion?: string | null
      allowSelfSigned?: boolean
    }
  ): Promise<JsonRequestResponse> {
    const url = new URL(targetUrl)
    const isHttps = url.protocol === "https:"
    const client = isHttps ? https : http
    const requestBody = options.body ? JSON.stringify(options.body) : null
    const tlsVersion = this.resolveTlsVersion(options.tlsVersion)

    return new Promise<JsonRequestResponse>((resolve, reject) => {
      const request = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          method: options.method,
          headers: {
            "Content-Type": "application/json",
            ...(requestBody ? { "Content-Length": String(Buffer.byteLength(requestBody)) } : {}),
            ...options.headers
          },
          ...(isHttps
            ? {
                rejectUnauthorized: !(options.allowSelfSigned ?? false),
                ...(tlsVersion
                  ? {
                      minVersion: tlsVersion,
                      maxVersion: tlsVersion
                    }
                  : {})
              }
            : {})
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          response.on("end", () => {
            const bodyText = Buffer.concat(chunks).toString("utf8")
            const bodyJson = this.tryParseJson(bodyText)
            const statusCode = response.statusCode ?? 0
            const result: JsonRequestResponse = {
              statusCode,
              headers: response.headers,
              bodyText,
              bodyJson
            }

            if (statusCode >= 200 && statusCode < 300) {
              resolve(result)
              return
            }

            const sapError = this.extractSapErrorMessage(bodyJson)
            reject(
              new ExternalRequestError(
                sapError || `SAP respondio con estado ${statusCode}.`,
                statusCode,
                bodyJson
              )
            )
          })
        }
      )

      request.setTimeout(15000, () => {
        request.destroy(new ExternalRequestError("Tiempo de espera agotado al conectar con SAP."))
      })

      request.on("error", (error) => {
        if (error instanceof ExternalRequestError) {
          reject(error)
          return
        }

        reject(new ExternalRequestError(error.message))
      })

      if (requestBody) {
        request.write(requestBody)
      }

      request.end()
    })
  }

  private tryParseJson(raw: string): Record<string, unknown> | null {
    if (!raw) return null

    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { raw }
    }
  }

  private resolveTlsVersion(value?: string | null): "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3" | undefined {
    switch (value) {
      case "1.0":
        return "TLSv1"
      case "1.1":
        return "TLSv1.1"
      case "1.2":
        return "TLSv1.2"
      case "1.3":
        return "TLSv1.3"
      default:
        return undefined
    }
  }

  private extractSapErrorMessage(payload: Record<string, unknown> | null): string | null {
    if (!payload) return null

    const directMessage = payload.message
    if (typeof directMessage === "string" && directMessage.trim()) {
      return directMessage.trim()
    }

    const errorNode = payload.error
    if (!errorNode || typeof errorNode !== "object") {
      return null
    }

    const errorMessageNode = (errorNode as Record<string, unknown>).message
    if (!errorMessageNode || typeof errorMessageNode !== "object") {
      return null
    }

    const valueNode = (errorMessageNode as Record<string, unknown>).value
    return typeof valueNode === "string" && valueNode.trim() ? valueNode.trim() : null
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
