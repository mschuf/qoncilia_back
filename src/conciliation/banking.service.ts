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
import { User } from "../users/entities/user.entity";
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateCompanyBankAccountDto } from "./dto/create-company-bank-account.dto";
import { ListCompanyBankingQueryDto } from "./dto/list-company-banking-query.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { UpdateCompanyBankAccountDto } from "./dto/update-company-bank-account.dto";
import { BankEntity } from "./entities/bank.entity";
import { CompanyBankAccount } from "./entities/company-bank-account.entity";
import { Currency } from "./entities/currency.entity";
import {
  CompanyBankingReferenceResponse,
  PublicBank,
  PublicCompanyBankAccount,
  PublicCurrency
} from "./interfaces/banking.interfaces";

@Injectable()
export class BankingService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(BankEntity)
    private readonly bankRepository: Repository<BankEntity>,
    @InjectRepository(CompanyBankAccount)
    private readonly companyBankAccountRepository: Repository<CompanyBankAccount>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>
  ) {}

  async listReference(
    actor: AuthUser,
    query: ListCompanyBankingQueryDto
  ): Promise<CompanyBankingReferenceResponse> {
    const companyId = await this.resolveAccessibleCompanyId(actor, query.companyId);
    const bankWhere = isSuperAdminRole(actor.roleCode)
      ? { company: { id: companyId } }
      : { company: { id: companyId }, user: { id: actor.id } };
    const accountWhere = isSuperAdminRole(actor.roleCode)
      ? { company: { id: companyId } }
      : { company: { id: companyId }, bank: { user: { id: actor.id } } };
    const [companies, banks, accounts, currencies] = await Promise.all([
      this.listCompaniesForActor(actor),
      this.bankRepository.find({
        where: bankWhere,
        relations: { company: true, user: true },
        order: { name: "ASC", id: "ASC" }
      }),
      this.companyBankAccountRepository.find({
        where: accountWhere,
        relations: { company: true, bank: { user: true, company: true } },
        order: { name: "ASC", id: "ASC" }
      }),
      this.currencyRepository.find({
        where: { active: true },
        order: { code: "ASC", id: "ASC" }
      })
    ]);

    return {
      companies: companies.map((item) => this.toPublicCompany(item)),
      banks: banks.map((item) => this.toPublicBank(item)),
      accounts: accounts.map((item) => this.toPublicCompanyBankAccount(item)),
      currencies: currencies.map((item) => this.toPublicCurrency(item))
    };
  }

  async createBank(payload: CreateBankDto, actor: AuthUser): Promise<PublicBank> {
    this.ensureAdminOrSuperadmin(actor);

    const companyId = await this.resolveAccessibleCompanyId(actor, payload.companyId);
    const owner = await this.resolveBankOwner(actor, companyId, payload.userId);

    const bank = this.bankRepository.create({
      company: owner.company,
      user: owner,
      name: this.normalizeRequired(payload.name, "name"),
      alias: this.normalizeOptional(payload.alias),
      description: this.normalizeOptional(payload.description),
      branch: this.normalizeOptional(payload.branch),
      active: payload.active ?? true
    });

    try {
      const created = await this.bankRepository.save(bank);
      const hydrated = await this.requireBank(created.id);
      return this.toPublicBank(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateBank(bankId: number, payload: UpdateBankDto, actor: AuthUser): Promise<PublicBank> {
    this.ensureAdminOrSuperadmin(actor);

    const bank = await this.requireBank(bankId);
    this.ensureActorCanManageBank(actor, bank);

    const nextCompanyId = payload.companyId ?? bank.company.id;
    if (payload.companyId !== undefined) {
      await this.resolveAccessibleCompanyId(actor, payload.companyId);
    }

    if (payload.userId !== undefined || payload.companyId !== undefined) {
      const owner = await this.resolveBankOwner(actor, nextCompanyId, payload.userId ?? bank.user.id);
      bank.company = owner.company;
      bank.user = owner;
    }

    if (payload.name !== undefined) {
      bank.name = this.normalizeRequired(payload.name, "name");
    }
    if (payload.alias !== undefined) {
      bank.alias = this.normalizeOptional(payload.alias);
    }
    if (payload.description !== undefined) {
      bank.description = this.normalizeOptional(payload.description);
    }
    if (payload.branch !== undefined) {
      bank.branch = this.normalizeOptional(payload.branch);
    }
    if (payload.active !== undefined) {
      bank.active = payload.active;
    }

    try {
      const updated = await this.bankRepository.save(bank);
      const hydrated = await this.requireBank(updated.id);
      return this.toPublicBank(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async deleteBank(bankId: number, actor: AuthUser): Promise<{ id: number; message: string }> {
    this.ensureAdminOrSuperadmin(actor);

    const bank = await this.requireBank(bankId);
    this.ensureActorCanManageBank(actor, bank);

    try {
      await this.bankRepository.delete(bank.id);
    } catch (error) {
      this.handleDatabaseError(error);
    }

    return {
      id: bank.id,
      message: "Banco eliminado."
    };
  }

  async createCompanyBankAccount(
    payload: CreateCompanyBankAccountDto,
    actor: AuthUser
  ): Promise<PublicCompanyBankAccount> {
    this.ensureAdminOrSuperadmin(actor);

    const companyId = await this.resolveAccessibleCompanyId(actor, payload.companyId);
    const [company, bank] = await Promise.all([
      this.requireCompany(companyId),
      this.requireBank(payload.bankId)
    ]);

    this.ensureBankBelongsToCompany(bank, company.id);
    this.ensureActorCanManageBank(actor, bank);

    const currency = await this.requireActiveCurrency(payload.currency);

    const account = this.companyBankAccountRepository.create({
      company,
      bank,
      name: this.normalizeRequired(payload.name, "name"),
      currency: currency.code,
      accountNumber: this.normalizeRequired(payload.accountNumber, "accountNumber"),
      bankErpId: this.normalizeRequired(payload.bankErpId, "bankErpId"),
      majorAccountNumber: this.normalizeRequired(payload.majorAccountNumber, "majorAccountNumber"),
      paymentAccountNumber: this.normalizeOptional(payload.paymentAccountNumber),
      active: payload.active ?? true
    });

    try {
      const created = await this.companyBankAccountRepository.save(account);
      const hydrated = await this.requireCompanyBankAccount(created.id);
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
    this.ensureActorCanManageAccount(actor, account);

    if (payload.companyId !== undefined && payload.companyId !== account.company.id) {
      const companyId = await this.resolveAccessibleCompanyId(actor, payload.companyId);
      account.company = await this.requireCompany(companyId);
    }

    if (payload.bankId !== undefined) {
      account.bank = await this.requireBank(payload.bankId);
      this.ensureActorCanManageBank(actor, account.bank);
    }

    this.ensureBankBelongsToCompany(account.bank, account.company.id);

    if (payload.name !== undefined) {
      account.name = this.normalizeRequired(payload.name, "name");
    }
    if (payload.currency !== undefined) {
      const currency = await this.requireActiveCurrency(payload.currency);
      account.currency = currency.code;
    }
    if (payload.accountNumber !== undefined) {
      account.accountNumber = this.normalizeRequired(payload.accountNumber, "accountNumber");
    }
    if (payload.bankErpId !== undefined) {
      account.bankErpId = this.normalizeRequired(payload.bankErpId, "bankErpId");
    }
    if (payload.majorAccountNumber !== undefined) {
      account.majorAccountNumber = this.normalizeRequired(
        payload.majorAccountNumber,
        "majorAccountNumber"
      );
    }
    if (payload.paymentAccountNumber !== undefined) {
      account.paymentAccountNumber = this.normalizeOptional(payload.paymentAccountNumber);
    }
    if (payload.active !== undefined) {
      account.active = payload.active;
    }

    try {
      const updated = await this.companyBankAccountRepository.save(account);
      const hydrated = await this.requireCompanyBankAccount(updated.id);
      return this.toPublicCompanyBankAccount(hydrated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async deleteCompanyBankAccount(
    accountId: number,
    actor: AuthUser
  ): Promise<{ id: number; message: string }> {
    this.ensureAdminOrSuperadmin(actor);

    const account = await this.requireCompanyBankAccount(accountId);
    this.ensureActorCanManageAccount(actor, account);

    try {
      await this.companyBankAccountRepository.delete(account.id);
    } catch (error) {
      this.handleDatabaseError(error);
    }

    return {
      id: account.id,
      message: "Cuenta bancaria eliminada."
    };
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
      throw new ForbiddenException("No podes administrar datos bancarios de otra empresa.");
    }

    return actor.companyId;
  }

  private async resolveBankOwner(
    actor: AuthUser,
    companyId: number,
    requestedUserId?: number
  ): Promise<User> {
    const targetUserId =
      requestedUserId ??
      (actor.companyId === companyId ? actor.id : undefined);

    if (!targetUserId) {
      throw new BadRequestException("userId es obligatorio para asignar el banco.");
    }

    if (!isSuperAdminRole(actor.roleCode) && targetUserId !== actor.id) {
      throw new ForbiddenException("No podes administrar bancos de otro usuario.");
    }

    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: { company: true, role: true }
    });

    if (!user) {
      throw new NotFoundException("Usuario responsable no encontrado.");
    }

    this.ensureActorCanAccessCompany(actor, user.company.id);

    if (user.company.id !== companyId) {
      throw new BadRequestException("El usuario responsable no pertenece a la empresa seleccionada.");
    }

    return user;
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

  private ensureActorCanManageBank(actor: AuthUser, bank: BankEntity) {
    this.ensureActorCanAccessCompany(actor, bank.company.id);

    if (isSuperAdminRole(actor.roleCode)) {
      return;
    }

    if (bank.user.id === actor.id) {
      return;
    }

    throw new ForbiddenException("No podes administrar bancos de otro usuario.");
  }

  private ensureActorCanManageAccount(actor: AuthUser, account: CompanyBankAccount) {
    this.ensureActorCanManageBank(actor, account.bank);
  }

  private ensureBankBelongsToCompany(bank: BankEntity, companyId: number) {
    if (bank.company.id !== companyId) {
      throw new BadRequestException("El banco seleccionado no pertenece a la empresa elegida.");
    }
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
      where: { id: bankId },
      relations: { company: true, user: true }
    });

    if (!bank) {
      throw new NotFoundException("Banco no encontrado.");
    }

    return bank;
  }

  private async requireCompanyBankAccount(accountId: number): Promise<CompanyBankAccount> {
    const account = await this.companyBankAccountRepository.findOne({
      where: { id: accountId },
      relations: { company: true, bank: { company: true, user: true } }
    });

    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada.");
    }

    return account;
  }

  private async requireActiveCurrency(value: string): Promise<Currency> {
    const code = this.normalizeRequired(value, "currency").toUpperCase();
    const currency = await this.currencyRepository.findOne({
      where: {
        code,
        active: true
      }
    });

    if (!currency) {
      throw new BadRequestException("La moneda seleccionada no existe o esta inactiva.");
    }

    return currency;
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
      companyId: bank.company.id,
      userId: bank.user.id,
      userLogin: bank.user.usrLogin,
      name: bank.name,
      alias: bank.alias,
      description: bank.description,
      branch: bank.branch,
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
      bankAlias: account.bank.alias,
      bankBranch: account.bank.branch,
      name: account.name,
      currency: account.currency,
      accountNumber: account.accountNumber,
      bankErpId: account.bankErpId,
      majorAccountNumber: account.majorAccountNumber,
      paymentAccountNumber: account.paymentAccountNumber,
      active: account.active
    };
  }

  private toPublicCurrency(currency: Currency): PublicCurrency {
    return {
      id: currency.id,
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      decimals: currency.decimals,
      active: currency.active
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

        if (detail.includes("banco_nombre") || constraint.includes("bancos")) {
          throw new ConflictException("Ya existe un banco con ese nombre para el usuario.");
        }

        if (constraint.includes("uq_cuentas_bancarias_empresa_banco_numero")) {
          throw new ConflictException("Ya existe una cuenta bancaria con esos datos en la empresa.");
        }

        throw new ConflictException("Ya existe un registro con esos datos unicos.");
      }

      if (driverError?.code === "23503") {
        throw new ConflictException(
          "No se puede eliminar el registro porque tiene datos asociados."
        );
      }
    }

    throw error;
  }
}
