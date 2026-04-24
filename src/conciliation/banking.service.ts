import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { Company } from "../access-control/entities/company.entity";
import { PublicCompany } from "../access-control/interfaces/access-control.interfaces";
import { Role } from "../common/enums/role.enum";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { isSuperAdminRole } from "../common/utils/role.util";
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateCompanyBankAccountDto } from "./dto/create-company-bank-account.dto";
import { ListCompanyBankingQueryDto } from "./dto/list-company-banking-query.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { UpdateCompanyBankAccountDto } from "./dto/update-company-bank-account.dto";
import { BankEntity } from "./entities/bank.entity";
import { CompanyBankAccount } from "./entities/company-bank-account.entity";
import {
  CompanyBankingReferenceResponse,
  PublicBank,
  PublicCompanyBankAccount
} from "./interfaces/banking.interfaces";

@Injectable()
export class BankingService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(BankEntity)
    private readonly bankRepository: Repository<BankEntity>,
    @InjectRepository(CompanyBankAccount)
    private readonly companyBankAccountRepository: Repository<CompanyBankAccount>
  ) {}

  async listReference(
    actor: AuthUser,
    query: ListCompanyBankingQueryDto
  ): Promise<CompanyBankingReferenceResponse> {
    const companyId = await this.resolveAccessibleCompanyId(actor, query.companyId);
    const [companies, banks, accounts] = await Promise.all([
      this.listCompaniesForActor(actor),
      this.bankRepository.find({ order: { name: "ASC", id: "ASC" } }),
      this.companyBankAccountRepository.find({
        where: { company: { id: companyId } },
        relations: { company: true, bank: true },
        order: { name: "ASC", id: "ASC" }
      })
    ]);

    return {
      companies: companies.map((item) => this.toPublicCompany(item)),
      banks: banks.map((item) => this.toPublicBank(item)),
      accounts: accounts.map((item) => this.toPublicCompanyBankAccount(item))
    };
  }

  async createBank(payload: CreateBankDto, actor: AuthUser): Promise<PublicBank> {
    this.ensureAdminOrSuperadmin(actor);

    const bank = this.bankRepository.create({
      name: this.normalizeRequired(payload.name, "name"),
      active: payload.active ?? true
    });

    try {
      const created = await this.bankRepository.save(bank);
      return this.toPublicBank(created);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateBank(bankId: number, payload: UpdateBankDto, actor: AuthUser): Promise<PublicBank> {
    this.ensureAdminOrSuperadmin(actor);

    const bank = await this.requireBank(bankId);
    if (payload.name !== undefined) {
      bank.name = this.normalizeRequired(payload.name, "name");
    }
    if (payload.active !== undefined) {
      bank.active = payload.active;
    }

    try {
      const updated = await this.bankRepository.save(bank);
      return this.toPublicBank(updated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async createCompanyBankAccount(
    payload: CreateCompanyBankAccountDto,
    actor: AuthUser
  ): Promise<PublicCompanyBankAccount> {
    this.ensureAdminOrSuperadmin(actor);

    const [companyId, bank] = await Promise.all([
      this.resolveAccessibleCompanyId(actor, payload.companyId),
      this.requireBank(payload.bankId)
    ]);
    const company = await this.requireCompany(companyId);

    const account = this.companyBankAccountRepository.create({
      company,
      bank,
      branch: this.normalizeOptional(payload.branch),
      name: this.normalizeRequired(payload.name, "name"),
      accountNumber: this.normalizeRequired(payload.accountNumber, "accountNumber"),
      bankErpId: this.normalizeRequired(payload.bankErpId, "bankErpId"),
      majorAccountNumber: this.normalizeRequired(payload.majorAccountNumber, "majorAccountNumber"),
      paymentAccountNumber: this.normalizeOptional(payload.paymentAccountNumber),
      active: payload.active ?? true
    });

    try {
      const created = await this.companyBankAccountRepository.save(account);
      const hydrated = await this.companyBankAccountRepository.findOne({
        where: { id: created.id },
        relations: { company: true, bank: true }
      });

      if (!hydrated) {
        throw new NotFoundException("No se pudo recuperar la cuenta bancaria creada.");
      }

      return this.toPublicCompanyBankAccount(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateCompanyBankAccount(
    accountId: number,
    payload: UpdateCompanyBankAccountDto,
    actor: AuthUser
  ): Promise<PublicCompanyBankAccount> {
    this.ensureAdminOrSuperadmin(actor);

    const account = await this.requireCompanyBankAccount(accountId);
    this.ensureActorCanAccessCompany(actor, account.company.id);

    if (payload.companyId !== undefined && payload.companyId !== account.company.id) {
      const companyId = await this.resolveAccessibleCompanyId(actor, payload.companyId);
      account.company = await this.requireCompany(companyId);
    }
    if (payload.bankId !== undefined) {
      account.bank = await this.requireBank(payload.bankId);
    }
    if (payload.branch !== undefined) {
      account.branch = this.normalizeOptional(payload.branch);
    }
    if (payload.name !== undefined) {
      account.name = this.normalizeRequired(payload.name, "name");
    }
    if (payload.accountNumber !== undefined) {
      account.accountNumber = this.normalizeRequired(payload.accountNumber, "accountNumber");
    }
    if (payload.bankErpId !== undefined) {
      account.bankErpId = this.normalizeRequired(payload.bankErpId, "bankErpId");
    }
    if (payload.majorAccountNumber !== undefined) {
      account.majorAccountNumber = this.normalizeRequired(payload.majorAccountNumber, "majorAccountNumber");
    }
    if (payload.paymentAccountNumber !== undefined) {
      account.paymentAccountNumber = this.normalizeOptional(payload.paymentAccountNumber);
    }
    if (payload.active !== undefined) {
      account.active = payload.active;
    }

    try {
      const updated = await this.companyBankAccountRepository.save(account);
      const hydrated = await this.companyBankAccountRepository.findOne({
        where: { id: updated.id },
        relations: { company: true, bank: true }
      });

      if (!hydrated) {
        throw new NotFoundException("No se pudo recuperar la cuenta bancaria actualizada.");
      }

      return this.toPublicCompanyBankAccount(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async listCompaniesForActor(actor: AuthUser): Promise<Company[]> {
    if (isSuperAdminRole(actor.roleCode)) {
      return this.companyRepository.find({
        order: { name: "ASC", id: "ASC" }
      });
    }

    const company = await this.requireCompany(actor.companyId);
    return [company];
  }

  private async resolveAccessibleCompanyId(
    actor: AuthUser,
    requestedCompanyId?: number
  ): Promise<number> {
    if (isSuperAdminRole(actor.roleCode)) {
      const companyId = requestedCompanyId ?? actor.companyId;
      if (!companyId) {
        throw new BadRequestException("companyId es obligatorio para superadmin.");
      }

      await this.requireCompany(companyId);
      return companyId;
    }

    if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
      throw new ForbiddenException("No podes administrar cuentas bancarias de otra empresa.");
    }

    return actor.companyId;
  }

  private ensureAdminOrSuperadmin(actor: AuthUser) {
    if (actor.roleCode !== Role.ADMIN && !isSuperAdminRole(actor.roleCode)) {
      throw new ForbiddenException("Solo admin y superadmin pueden administrar bancos.");
    }
  }

  private ensureActorCanAccessCompany(actor: AuthUser, companyId: number) {
    if (isSuperAdminRole(actor.roleCode)) {
      return;
    }

    if (actor.roleCode === Role.ADMIN && actor.companyId === companyId) {
      return;
    }

    throw new ForbiddenException("No podes administrar bancos de otra empresa.");
  }

  private async requireCompany(companyId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException("Empresa no encontrada.");
    }

    return company;
  }

  private async requireBank(bankId: number): Promise<BankEntity> {
    const bank = await this.bankRepository.findOne({
      where: { id: bankId }
    });

    if (!bank) {
      throw new NotFoundException("Banco no encontrado.");
    }

    return bank;
  }

  private async requireCompanyBankAccount(accountId: number): Promise<CompanyBankAccount> {
    const account = await this.companyBankAccountRepository.findOne({
      where: { id: accountId },
      relations: { company: true, bank: true }
    });

    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada.");
    }

    return account;
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
    };
  }

  private toPublicBank(bank: BankEntity): PublicBank {
    return {
      id: bank.id,
      name: bank.name,
      active: bank.active
    };
  }

  private toPublicCompanyBankAccount(account: CompanyBankAccount): PublicCompanyBankAccount {
    return {
      id: account.id,
      companyId: account.company.id,
      companyName: account.company.name,
      bankId: account.bank.id,
      bankName: account.bank.name,
      branch: account.branch,
      name: account.name,
      accountNumber: account.accountNumber,
      bankErpId: account.bankErpId,
      majorAccountNumber: account.majorAccountNumber,
      paymentAccountNumber: account.paymentAccountNumber,
      active: account.active
    };
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

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & {
        driverError?: { code?: string; detail?: string; constraint?: string };
      }).driverError;

      if (driverError?.code === "23505") {
        const detail = String(driverError.detail ?? "").toLowerCase();
        const constraint = String(driverError.constraint ?? "").toLowerCase();

        if (detail.includes("ban_nombre") || constraint.includes("bancos")) {
          throw new ConflictException("Ya existe un banco con ese nombre.");
        }

        if (constraint.includes("uq_empresas_cuentas_bancarias_empresa_banco_cuenta")) {
          throw new ConflictException("Ya existe una cuenta bancaria con esos datos en la empresa.");
        }

        throw new ConflictException("Ya existe un registro con esos datos unicos.");
      }
    }

    throw error;
  }
}
