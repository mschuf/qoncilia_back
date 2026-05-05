import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { QueryFailedError, Repository } from "typeorm"
import { Company } from "../access-control/entities/company.entity"
import { PublicCompany } from "../access-control/interfaces/access-control.interfaces"
import { ErpType } from "../common/enums/erp-type.enum"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { encryptText } from "../common/utils/encryption.util"
import { isSuperAdminRole } from "../common/utils/role.util"
import { CreateCompanyErpConfigDto } from "./dto/create-company-erp-config.dto"
import { ListCompanyErpConfigsQueryDto } from "./dto/list-company-erp-configs-query.dto"
import { UpdateCompanyErpConfigDto } from "./dto/update-company-erp-config.dto"
import { CompanyErpConfig } from "./entities/company-erp-config.entity"
import {
  ErpReferenceResponse,
  PublicCompanyErpConfig
} from "./interfaces/erp.interfaces"
import { ensureSapErpType, validateSapConfig } from "./sap/sap-config.validator"

@Injectable()
export class ErpService {
  private readonly credentialSecret: string

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyErpConfig)
    private readonly companyErpConfigRepository: Repository<CompanyErpConfig>,
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

    this.validateProviderConfig(erpConfig)

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

      if (config.isDefault && !config.active) {
        throw new BadRequestException("Una configuracion predeterminada no puede quedar inactiva.")
      }

      this.validateProviderConfig(config)

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

  private validateProviderConfig(config: CompanyErpConfig) {
    if (config.erpType === ErpType.SAP_B1) {
      ensureSapErpType(config.erpType)
      validateSapConfig(config, false)
      return
    }

    throw new BadRequestException("Tipo de ERP no soportado.")
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
