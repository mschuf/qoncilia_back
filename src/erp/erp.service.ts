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
import { Role } from "../common/enums/role.enum"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { encryptText } from "../common/utils/encryption.util"
import { isSuperAdminRole } from "../common/utils/role.util"
import { CopyCompanyErpConfigDto } from "./dto/copy-company-erp-config.dto"
import { CreateCompanyErpConfigDto } from "./dto/create-company-erp-config.dto"
import { CreateErpConfigTemplateDto } from "./dto/create-erp-config-template.dto"
import { ListCompanyErpConfigsQueryDto } from "./dto/list-company-erp-configs-query.dto"
import { UpdateCompanyErpConfigDto } from "./dto/update-company-erp-config.dto"
import { UpdateErpConfigTemplateDto } from "./dto/update-erp-config-template.dto"
import { CompanyErpConfig } from "./entities/company-erp-config.entity"
import { ErpConfigTemplate } from "./entities/erp-config-template.entity"
import {
  ErpReferenceResponse,
  PublicCompanyErpConfig,
  PublicErpConfigTemplate
} from "./interfaces/erp.interfaces"
import { ensureSapErpType, validateSapConfig } from "./sap/sap-config.validator"

type ErpConfigPayload =
  | CreateCompanyErpConfigDto
  | CreateErpConfigTemplateDto
  | UpdateCompanyErpConfigDto
  | UpdateErpConfigTemplateDto

@Injectable()
export class ErpService {
  private readonly credentialSecret: string

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyErpConfig)
    private readonly companyErpConfigRepository: Repository<CompanyErpConfig>,
    @InjectRepository(ErpConfigTemplate)
    private readonly erpConfigTemplateRepository: Repository<ErpConfigTemplate>,
    configService: ConfigService
  ) {
    this.credentialSecret =
      configService.get<string>("ERP_CREDENTIAL_SECRET")?.trim() ||
      configService.get<string>("JWT_SECRET", "CHANGE_THIS_FOR_A_LONG_RANDOM_SECRET")
  }

  async listReference(actor: AuthUser): Promise<ErpReferenceResponse> {
    const companies = await this.listCompaniesForActor(actor)
    return {
      companies: companies.map((company) =>
        this.toPublicCompany(company, { includeIntegration: isSuperAdminRole(actor.roleCode) })
      ),
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
    const queryBuilder = this.companyErpConfigRepository
      .createQueryBuilder("config")
      .leftJoinAndSelect("config.company", "company")
      .leftJoinAndSelect("config.template", "template")
      .where("1 = 1")
      .orderBy("config.code", "ASC")
      .addOrderBy("config.name", "ASC")
      .addOrderBy("company.name", "ASC")
      .addOrderBy("config.id", "ASC")

    if (isSuperAdminRole(actor.roleCode)) {
      if (query.companyId) {
        await this.requireCompany(query.companyId)
        queryBuilder.andWhere("company.id = :companyId", { companyId: query.companyId })
      }
    } else {
      const companyId = await this.resolveAccessibleCompanyId(actor, query.companyId)
      queryBuilder.andWhere("company.id = :companyId", { companyId })
    }

    if (query.activeOnly) {
      queryBuilder.andWhere("config.active = :active", { active: true })
    }

    const configs = await queryBuilder.getMany()
    return configs.map((config) => this.toPublicCompanyErpConfig(config))
  }

  async listErpConfigTemplates(actor: AuthUser): Promise<PublicErpConfigTemplate[]> {
    this.ensureSuperadmin(actor)

    const templates = await this.erpConfigTemplateRepository.find({
      relations: { configs: { company: true } },
      order: { code: "ASC", name: "ASC", id: "ASC" }
    })

    return templates.map((template) => this.toPublicErpConfigTemplate(template))
  }

  async createErpConfigTemplate(
    payload: CreateErpConfigTemplateDto,
    actor: AuthUser
  ): Promise<PublicErpConfigTemplate> {
    this.ensureSuperadmin(actor)

    const template = this.buildErpConfigTemplate(payload)

    try {
      const saved = await this.erpConfigTemplateRepository.save(template)
      const persisted = await this.erpConfigTemplateRepository.findOne({
        where: { id: saved.id },
        relations: { configs: { company: true } }
      })

      if (!persisted) {
        throw new NotFoundException("No se pudo recuperar la plantilla ERP creada.")
      }

      return this.toPublicErpConfigTemplate(persisted)
    } catch (error) {
      this.handleDatabaseError(error)
    }
  }

  async updateErpConfigTemplate(
    templateId: number,
    payload: UpdateErpConfigTemplateDto,
    actor: AuthUser
  ): Promise<PublicErpConfigTemplate> {
    this.ensureSuperadmin(actor)

    const template = await this.erpConfigTemplateRepository.findOne({
      where: { id: templateId },
      relations: { configs: { company: true } }
    })

    if (!template) {
      throw new NotFoundException("Plantilla ERP no encontrada.")
    }

    this.applyTemplatePayload(template, payload)
    this.validateTemplateConfig(template)

    try {
      await this.erpConfigTemplateRepository.save(template)
      const persisted = await this.erpConfigTemplateRepository.findOne({
        where: { id: template.id },
        relations: { configs: { company: true } }
      })

      if (!persisted) {
        throw new NotFoundException("No se pudo recuperar la plantilla ERP actualizada.")
      }

      return this.toPublicErpConfigTemplate(persisted)
    } catch (error) {
      this.handleDatabaseError(error)
    }
  }

  async deleteErpConfigTemplate(
    templateId: number,
    actor: AuthUser
  ): Promise<{ id: number; code: string; message: string }> {
    this.ensureSuperadmin(actor)

    const template = await this.erpConfigTemplateRepository.findOne({
      where: { id: templateId }
    })

    if (!template) {
      throw new NotFoundException("Plantilla ERP no encontrada.")
    }

    await this.erpConfigTemplateRepository.delete(template.id)

    return {
      id: template.id,
      code: template.code,
      message: "Plantilla ERP eliminada."
    }
  }

  async copyErpConfigTemplate(
    templateId: number,
    payload: CopyCompanyErpConfigDto,
    actor: AuthUser
  ): Promise<PublicCompanyErpConfig[]> {
    this.ensureSuperadmin(actor)

    const companyIds = this.normalizeCompanyIds(payload.companyIds)
    if (companyIds.length === 0) {
      throw new BadRequestException("Selecciona al menos una empresa para asignar la plantilla.")
    }

    const template = await this.erpConfigTemplateRepository.findOne({
      where: { id: templateId }
    })

    if (!template) {
      throw new NotFoundException("Plantilla ERP no encontrada.")
    }

    const companies = await this.requireCompanies(companyIds)

    try {
      return this.companyErpConfigRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(CompanyErpConfig)
        const existingConfigs = await repository
          .createQueryBuilder("config")
          .leftJoinAndSelect("config.company", "company")
          .where("company.id IN (:...companyIds)", { companyIds })
          .andWhere("LOWER(config.code) = LOWER(:code)", { code: template.code })
          .getMany()

        if (existingConfigs.length > 0) {
          throw new ConflictException(
            `Ya existe la configuracion ${template.code} en: ${existingConfigs
              .map((config) => config.company.name)
              .join(", ")}.`
          )
        }

        const createdConfigs: PublicCompanyErpConfig[] = []
        for (const company of companies) {
          const existingCount = await repository.count({
            where: { company: { id: company.id } }
          })
          const erpConfig = this.cloneTemplateToCompanyConfig(template, company, existingCount)

          if (erpConfig.isDefault) {
            await this.clearDefaultConfigForCompany(repository, company.id)
          }
          if (erpConfig.active) {
            await this.clearActiveConfigForCompany(repository, company.id)
          }

          const saved = await repository.save(erpConfig)
          const persisted = await repository.findOne({
            where: { id: saved.id },
            relations: { company: true, template: true }
          })

          if (!persisted) {
            throw new NotFoundException("No se pudo recuperar la configuracion ERP copiada.")
          }

          createdConfigs.push(this.toPublicCompanyErpConfig(persisted))
        }

        return createdConfigs
      })
    } catch (error) {
      this.handleDatabaseError(error)
    }
  }

  private buildErpConfigTemplate(payload: CreateErpConfigTemplateDto): ErpConfigTemplate {
    const template = this.erpConfigTemplateRepository.create({
      code: this.normalizeCode(payload.code),
      name: this.normalizeRequired(payload.name, "name"),
      active: payload.active ?? this.hasOperationalConfig(payload),
      isDefault: payload.isDefault ?? false,
      userSystem: this.normalizeOptional(payload.userSystem),
      userPassEncrypted: this.encryptOptionalCredential(payload.userPass),
      dbName: this.normalizeOptional(payload.dbName),
      serverNode: this.normalizeOptional(payload.serverNode),
      dbUser: this.normalizeOptional(payload.dbUser),
      dbPasswordEncrypted: this.encryptOptionalCredential(payload.password),
      serviceLayerUrl: this.normalizeUrl(payload.serviceLayerUrl),
      tlsVersion: this.normalizeOptional(payload.tlsVersion),
      allowSelfSigned: payload.allowSelfSigned ?? false,
      settings: this.toJsonRecord(payload.settings)
    })

    this.validateTemplateConfig(template)

    return template
  }

  private applyTemplatePayload(template: ErpConfigTemplate, payload: UpdateErpConfigTemplateDto) {
    if (payload.code !== undefined) template.code = this.normalizeCode(payload.code)
    if (payload.name !== undefined) template.name = this.normalizeRequired(payload.name, "name")
    if (payload.active !== undefined) template.active = payload.active
    if (payload.isDefault !== undefined) template.isDefault = payload.isDefault
    if (payload.userSystem !== undefined) {
      template.userSystem = this.normalizeOptional(payload.userSystem)
    }
    if (payload.userPass !== undefined) {
      const preparedUserPass = this.normalizeOptional(payload.userPass)
      if (preparedUserPass) {
        template.userPassEncrypted = encryptText(preparedUserPass, this.credentialSecret)
      }
    }
    if (payload.dbName !== undefined) template.dbName = this.normalizeOptional(payload.dbName)
    if (payload.serverNode !== undefined) {
      template.serverNode = this.normalizeOptional(payload.serverNode)
    }
    if (payload.dbUser !== undefined) template.dbUser = this.normalizeOptional(payload.dbUser)
    if (payload.serviceLayerUrl !== undefined) {
      template.serviceLayerUrl = this.normalizeUrl(payload.serviceLayerUrl)
    }
    if (payload.tlsVersion !== undefined) {
      template.tlsVersion = this.normalizeOptional(payload.tlsVersion)
    }
    if (payload.allowSelfSigned !== undefined) {
      template.allowSelfSigned = payload.allowSelfSigned
    }
    if (payload.settings !== undefined) {
      template.settings = this.toJsonRecord(payload.settings)
    }

    const preparedPassword = this.normalizeOptional(payload.password)
    if (preparedPassword) {
      template.dbPasswordEncrypted = encryptText(preparedPassword, this.credentialSecret)
    }
  }

  private validateTemplateConfig(template: ErpConfigTemplate) {
    if (template.isDefault && !template.active) {
      throw new BadRequestException("Una plantilla predeterminada no puede quedar inactiva.")
    }

    this.validateProviderConfig(template)
  }

  private cloneTemplateToCompanyConfig(
    template: ErpConfigTemplate,
    company: Company,
    existingCount: number
  ): CompanyErpConfig {
    const erpConfig = this.companyErpConfigRepository.create({
      template,
      company,
      code: template.code,
      name: template.name,
      active: template.active,
      isDefault: template.isDefault && template.active && existingCount === 0,
      userSystem: template.userSystem,
      userPassEncrypted: template.userPassEncrypted,
      dbName: template.dbName,
      serverNode: template.serverNode,
      dbUser: template.dbUser,
      dbPasswordEncrypted: template.dbPasswordEncrypted,
      serviceLayerUrl: template.serviceLayerUrl,
      tlsVersion: template.tlsVersion,
      allowSelfSigned: template.allowSelfSigned,
      settings: this.toJsonRecord(template.settings)
    })

    this.validateProviderConfig(erpConfig)

    return erpConfig
  }

  async createCompanyErpConfig(
    payload: CreateCompanyErpConfigDto,
    actor: AuthUser
  ): Promise<PublicCompanyErpConfig | PublicCompanyErpConfig[]> {
    this.ensureSuperadmin(actor)

    const companyIds = this.resolveTargetCompanyIds(payload)
    const companies = await this.requireCompanies(companyIds)

    try {
      return this.companyErpConfigRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(CompanyErpConfig)
        const createdConfigs: PublicCompanyErpConfig[] = []

        for (const company of companies) {
          const existingCount = await repository.count({
            where: { company: { id: company.id } }
          })
          const erpConfig = this.buildCompanyErpConfig(payload, company, existingCount)

          if (erpConfig.isDefault) {
            await this.clearDefaultConfigForCompany(repository, company.id)
          }
          if (erpConfig.active) {
            await this.clearActiveConfigForCompany(repository, company.id)
          }

          const saved = await repository.save(erpConfig)
          const persisted = await repository.findOne({
            where: { id: saved.id },
            relations: { company: true, template: true }
          })

          if (!persisted) {
            throw new NotFoundException("No se pudo recuperar la configuracion ERP creada.")
          }

          createdConfigs.push(this.toPublicCompanyErpConfig(persisted))
        }

        return createdConfigs.length === 1 ? createdConfigs[0] : createdConfigs
      })
    } catch (error) {
      this.handleDatabaseError(error)
    }
  }

  async copyCompanyErpConfig(
    sourceConfigId: number,
    payload: CopyCompanyErpConfigDto,
    actor: AuthUser
  ): Promise<PublicCompanyErpConfig[]> {
    this.ensureSuperadmin(actor)

    const targetCompanyIds = this.normalizeCompanyIds(payload.companyIds)
    const sourceConfig = await this.companyErpConfigRepository.findOne({
      where: { id: sourceConfigId },
      relations: { company: true, template: true }
    })

    if (!sourceConfig) {
      throw new NotFoundException("Configuracion ERP origen no encontrada.")
    }

    const copyCompanyIds = targetCompanyIds.filter((companyId) => companyId !== sourceConfig.company.id)
    if (copyCompanyIds.length === 0) {
      throw new BadRequestException("Selecciona al menos una empresa distinta para copiar la configuracion.")
    }

    const companies = await this.requireCompanies(copyCompanyIds)

    try {
      return this.companyErpConfigRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(CompanyErpConfig)
        const existingConfigs = await repository
          .createQueryBuilder("config")
          .leftJoinAndSelect("config.company", "company")
          .where("company.id IN (:...companyIds)", { companyIds: copyCompanyIds })
          .andWhere("LOWER(config.code) = LOWER(:code)", { code: sourceConfig.code })
          .getMany()

        if (existingConfigs.length > 0) {
          throw new ConflictException(
            `Ya existe la configuracion ${sourceConfig.code} en: ${existingConfigs
              .map((config) => config.company.name)
              .join(", ")}.`
          )
        }

        const createdConfigs: PublicCompanyErpConfig[] = []
        for (const company of companies) {
          const existingCount = await repository.count({
            where: { company: { id: company.id } }
          })
          const erpConfig = this.cloneCompanyErpConfig(sourceConfig, company, existingCount)

          if (erpConfig.isDefault) {
            await this.clearDefaultConfigForCompany(repository, company.id)
          }
          if (erpConfig.active) {
            await this.clearActiveConfigForCompany(repository, company.id)
          }

          const saved = await repository.save(erpConfig)
          const persisted = await repository.findOne({
            where: { id: saved.id },
            relations: { company: true, template: true }
          })

          if (!persisted) {
            throw new NotFoundException("No se pudo recuperar la configuracion ERP copiada.")
          }

          createdConfigs.push(this.toPublicCompanyErpConfig(persisted))
        }

        return createdConfigs
      })
    } catch (error) {
      this.handleDatabaseError(error)
    }
  }

  private cloneCompanyErpConfig(
    sourceConfig: CompanyErpConfig,
    company: Company,
    existingCount: number
  ): CompanyErpConfig {
    const erpConfig = this.companyErpConfigRepository.create({
      template: sourceConfig.template,
      company,
      code: sourceConfig.code,
      name: sourceConfig.name,
      active: sourceConfig.active,
      isDefault: sourceConfig.active && existingCount === 0,
      userSystem: sourceConfig.userSystem,
      userPassEncrypted: sourceConfig.userPassEncrypted,
      dbName: sourceConfig.dbName,
      serverNode: sourceConfig.serverNode,
      queryBanco: sourceConfig.queryBanco,
      querySistema: sourceConfig.querySistema,
      dbUser: sourceConfig.dbUser,
      dbPasswordEncrypted: sourceConfig.dbPasswordEncrypted,
      serviceLayerUrl: sourceConfig.serviceLayerUrl,
      tlsVersion: sourceConfig.tlsVersion,
      allowSelfSigned: sourceConfig.allowSelfSigned,
      settings: this.toJsonRecord(sourceConfig.settings)
    })

    this.validateProviderConfig(erpConfig)

    return erpConfig
  }

  private buildCompanyErpConfig(
    payload: CreateCompanyErpConfigDto,
    company: Company,
    existingCount: number
  ): CompanyErpConfig {
    const nextActive = payload.active ?? this.hasOperationalConfig(payload)
    const nextIsDefault = payload.isDefault ?? (nextActive && existingCount === 0)

    const preparedPassword = this.normalizeOptional(payload.password)
    const erpConfig = this.companyErpConfigRepository.create({
      company,
      code: this.normalizeCode(payload.code),
      name: this.normalizeRequired(payload.name, "name"),
      active: nextActive,
      isDefault: nextIsDefault,
      userSystem: this.normalizeOptional(payload.userSystem),
      userPassEncrypted: this.encryptOptionalCredential(payload.userPass),
      dbName: this.normalizeOptional(payload.dbName),
      serverNode: this.normalizeOptional(payload.serverNode),
      queryBanco: this.normalizeOptional(payload.queryBanco),
      querySistema: this.normalizeOptional(payload.querySistema),
      dbUser: this.normalizeOptional(payload.dbUser),
      dbPasswordEncrypted: preparedPassword ? encryptText(preparedPassword, this.credentialSecret) : null,
      serviceLayerUrl: this.normalizeUrl(payload.serviceLayerUrl),
      tlsVersion: this.normalizeOptional(payload.tlsVersion),
      allowSelfSigned: payload.allowSelfSigned ?? false,
      settings: this.toJsonRecord(payload.settings)
    })

    if (erpConfig.isDefault && !erpConfig.active) {
      throw new BadRequestException("Una configuracion predeterminada no puede quedar inactiva.")
    }

    this.validateProviderConfig(erpConfig)

    return erpConfig
  }

  async updateCompanyErpConfig(
    configId: number,
    payload: UpdateCompanyErpConfigDto,
    actor: AuthUser
  ): Promise<PublicCompanyErpConfig> {
    return this.companyErpConfigRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(CompanyErpConfig)
      const config = await repository.findOne({
        where: { id: configId },
        relations: { company: true, template: true }
      })

      if (!config) {
        throw new NotFoundException("Configuracion ERP no encontrada.")
      }

      this.ensureCanEditConfig(actor, config)
      this.ensureAllowedUpdatePayload(actor, payload)

      if (payload.companyId !== undefined && payload.companyId !== config.company.id) {
        config.company = await this.requireCompany(payload.companyId)
      }

      if (payload.code !== undefined) config.code = this.normalizeCode(payload.code)
      if (payload.name !== undefined) config.name = this.normalizeRequired(payload.name, "name")
      if (payload.active !== undefined) config.active = payload.active
      if (payload.isDefault !== undefined) config.isDefault = payload.isDefault
      if (payload.userSystem !== undefined) {
        config.userSystem = this.normalizeOptional(payload.userSystem)
      }
      if (payload.userPass !== undefined) {
        const preparedUserPass = this.normalizeOptional(payload.userPass)
        if (preparedUserPass) {
          config.userPassEncrypted = encryptText(preparedUserPass, this.credentialSecret)
        }
      }
      if (payload.dbName !== undefined) config.dbName = this.normalizeOptional(payload.dbName)
      if (payload.serverNode !== undefined) {
        config.serverNode = this.normalizeOptional(payload.serverNode)
      }
      if (payload.queryBanco !== undefined) {
        config.queryBanco = this.normalizeOptional(payload.queryBanco)
      }
      if (payload.querySistema !== undefined) {
        config.querySistema = this.normalizeOptional(payload.querySistema)
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

      if (config.active) {
        await this.clearActiveConfigForCompany(repository, config.company.id, config.id)
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
        relations: { company: true, template: true }
      })

      if (!persisted) {
        throw new NotFoundException("No se pudo recuperar la configuracion ERP actualizada.")
      }

      return this.toPublicCompanyErpConfig(persisted)
    })
  }

  async deleteCompanyErpConfig(
    configId: number,
    actor: AuthUser
  ): Promise<{ id: number; companyId: number; code: string; message: string }> {
    this.ensureSuperadmin(actor)

    const config = await this.companyErpConfigRepository.findOne({
      where: { id: configId },
      relations: { company: true, template: true }
    })

    if (!config) {
      throw new NotFoundException("Configuracion ERP no encontrada.")
    }

    await this.companyErpConfigRepository.delete(config.id)

    return {
      id: config.id,
      companyId: config.company.id,
      code: config.code,
      message: "Configuracion ERP eliminada de la empresa."
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

  private async requireCompanies(companyIds: number[]): Promise<Company[]> {
    const companies = await this.companyRepository.find({
      where: companyIds.map((id) => ({ id })),
      order: { name: "ASC", id: "ASC" }
    })

    if (companies.length !== companyIds.length) {
      const missing = companyIds.filter((id) => !companies.some((company) => company.id === id))
      throw new NotFoundException(`Empresa no encontrada: ${missing.join(", ")}.`)
    }

    const companyById = new Map(companies.map((company) => [company.id, company]))
    return companyIds.map((id) => companyById.get(id)).filter((company): company is Company => Boolean(company))
  }

  private resolveTargetCompanyIds(payload: CreateCompanyErpConfigDto): number[] {
    const ids = payload.companyIds?.length ? payload.companyIds : payload.companyId ? [payload.companyId] : []
    const uniqueIds = this.normalizeCompanyIds(ids)
    if (uniqueIds.length === 0) {
      throw new BadRequestException("Debes seleccionar al menos una empresa.")
    }

    return uniqueIds
  }

  private normalizeCompanyIds(companyIds: number[]): number[] {
    return Array.from(new Set(companyIds.filter((id) => Number.isFinite(id) && id > 0)))
  }

  private ensureSuperadmin(actor: AuthUser) {
    if (!isSuperAdminRole(actor.roleCode)) {
      throw new ForbiddenException("Solo el super admin puede administrar configuraciones ERP.")
    }
  }

  private ensureCanEditConfig(actor: AuthUser, config: CompanyErpConfig) {
    if (isSuperAdminRole(actor.roleCode)) return

    if (actor.roleCode === Role.ADMIN && config.company.id === actor.companyId) {
      return
    }

    throw new ForbiddenException("No podes editar configuraciones ERP de otra empresa.")
  }

  private ensureAllowedUpdatePayload(actor: AuthUser, payload: UpdateCompanyErpConfigDto) {
    if (isSuperAdminRole(actor.roleCode)) return

    const allowedForAdmin = new Set<keyof UpdateCompanyErpConfigDto>([
      "name",
      "active",
      "isDefault",
      "userSystem",
      "userPass",
      "dbName",
      "serverNode",
      "queryBanco",
      "querySistema",
      "dbUser",
      "password",
      "serviceLayerUrl",
      "tlsVersion"
    ])

    const rejected = Object.keys(payload).filter(
      (key) => !allowedForAdmin.has(key as keyof UpdateCompanyErpConfigDto)
    )

    if (rejected.length > 0) {
      throw new ForbiddenException("No tenes permisos para editar esos campos de la configuracion ERP.")
    }
  }

  private validateProviderConfig(config: CompanyErpConfig | ErpConfigTemplate) {
    if (config.erpType === ErpType.SAP_B1) {
      ensureSapErpType(config.erpType)
      if (config.active) {
        validateSapConfig(config, false)
      }
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

  private async clearActiveConfigForCompany(
    repository: Repository<CompanyErpConfig>,
    companyId: number,
    excludeConfigId?: number
  ) {
    const query = repository
      .createQueryBuilder()
      .update(CompanyErpConfig)
      .set({ active: false })
      .where("emp_id = :companyId", { companyId })

    if (excludeConfigId) {
      query.andWhere("epc_id <> :configId", { configId: excludeConfigId })
    }

    await query.execute()
  }

  private toPublicCompany(
    company: Company,
    { includeIntegration = true }: { includeIntegration?: boolean } = {}
  ): PublicCompany {
    return {
      id: company.id,
      code: company.code,
      fiscalId: company.code,
      name: company.name,
      active: company.active,
      webserviceErp: includeIntegration ? company.webserviceErp : null,
      schemeErp: includeIntegration ? company.schemeErp : null,
      tlsVersionErp: includeIntegration ? company.tlsVersionErp : null,
      cardsId: includeIntegration ? company.cardsId : null,
      logo: company.logo,
      address: company.address,
      region: company.region,
      country: company.country,
      validityDate: company.validityDate
    }
  }

  private toPublicCompanyErpConfig(config: CompanyErpConfig): PublicCompanyErpConfig {
    return {
      id: config.id,
      templateId: config.template?.id ?? null,
      companyId: config.company.id,
      companyCode: config.company.code,
      companyName: config.company.name,
      code: config.code,
      name: config.name,
      erpType: config.erpType,
      active: config.active,
      isDefault: config.isDefault,
      userSystem: config.userSystem,
      dbName: config.dbName,
      serverNode: config.serverNode,
      queryBanco: config.queryBanco,
      querySistema: config.querySistema,
      dbUser: config.dbUser,
      serviceLayerUrl: config.serviceLayerUrl,
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned,
      settings: config.settings,
      hasUserPass: Boolean(config.userPassEncrypted),
      hasPassword: Boolean(config.dbPasswordEncrypted),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    }
  }

  private toPublicErpConfigTemplate(template: ErpConfigTemplate): PublicErpConfigTemplate {
    const configs = [...(template.configs ?? [])].sort(
      (left, right) => left.company.name.localeCompare(right.company.name) || left.id - right.id
    )
    configs.forEach((config) => {
      config.template = template
    })

    return {
      id: template.id,
      code: template.code,
      name: template.name,
      erpType: template.erpType,
      active: template.active,
      isDefault: template.isDefault,
      userSystem: template.userSystem,
      dbName: template.dbName,
      serverNode: template.serverNode,
      dbUser: template.dbUser,
      serviceLayerUrl: template.serviceLayerUrl,
      tlsVersion: template.tlsVersion,
      allowSelfSigned: template.allowSelfSigned,
      settings: template.settings,
      hasUserPass: Boolean(template.userPassEncrypted),
      hasPassword: Boolean(template.dbPasswordEncrypted),
      configs: configs.map((config) => this.toPublicCompanyErpConfig(config)),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
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

  private encryptOptionalCredential(value?: string | null): string | null {
    const normalized = this.normalizeOptional(value)
    return normalized ? encryptText(normalized, this.credentialSecret) : null
  }

  private hasOperationalConfig(payload: ErpConfigPayload): boolean {
    return Boolean(
      this.normalizeOptional(payload.dbName) &&
        this.normalizeOptional(payload.serviceLayerUrl) &&
        this.normalizeOptional(payload.tlsVersion)
    )
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

        if (constraint.includes("uq_erp_configuraciones_plantillas_codigo") || detail.includes("ept_codigo")) {
          throw new ConflictException("Ya existe una plantilla ERP con ese codigo.")
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
