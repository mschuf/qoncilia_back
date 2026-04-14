import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { CreateCompanyBankDto } from "./dto/create-company-bank.dto";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyBankDto } from "./dto/update-company-bank.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { CompanyBank } from "./entities/company-bank.entity";
import { Company } from "./entities/company.entity";
import { CompanyOption, PublicCompany, PublicCompanyBank } from "./interfaces/public-company.interface";

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyBank)
    private readonly companyBankRepository: Repository<CompanyBank>
  ) {}

  async listCompanies(): Promise<PublicCompany[]> {
    const companies = await this.companyRepository.find({
      relations: { bancos: true },
      order: {
        id: "ASC",
        bancos: { id: "ASC" }
      }
    });

    return companies.map((item) => this.toPublicCompany(item));
  }

  async listActiveOptions(): Promise<CompanyOption[]> {
    const companies = await this.companyRepository.find({
      where: { activo: true },
      order: { nombre: "ASC" },
      select: {
        id: true,
        nombre: true
      }
    });

    return companies.map((item) => ({
      id: item.id,
      nombre: item.nombre
    }));
  }

  async createCompany(payload: CreateCompanyDto): Promise<PublicCompany> {
    const company = this.companyRepository.create({
      nombre: this.normalizeRequired(payload.nombre, "nombre"),
      ruc: this.normalizeOptional(payload.ruc),
      email: this.normalizeOptional(payload.email),
      telefono: this.normalizeOptional(payload.telefono),
      direccion: this.normalizeOptional(payload.direccion),
      activo: payload.activo ?? true
    });

    try {
      const createdCompany = await this.companyRepository.save(company);

      if (payload.bancos && payload.bancos.length > 0) {
        const banks = payload.bancos.map((bankPayload) =>
          this.companyBankRepository.create({
            empresa: createdCompany,
            bancoNombre: this.normalizeRequired(bankPayload.bancoNombre, "bancoNombre"),
            tipoCuenta: this.normalizeRequired(bankPayload.tipoCuenta, "tipoCuenta"),
            moneda: this.normalizeRequired(bankPayload.moneda, "moneda").toUpperCase(),
            numeroCuenta: this.normalizeRequired(bankPayload.numeroCuenta, "numeroCuenta"),
            titular: this.normalizeOptional(bankPayload.titular),
            sucursal: this.normalizeOptional(bankPayload.sucursal),
            activo: bankPayload.activo ?? true
          })
        );

        await this.companyBankRepository.save(banks);
      }

      return this.requirePublicCompany(createdCompany.id);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateCompany(id: number, payload: UpdateCompanyDto): Promise<PublicCompany> {
    const company = await this.requireCompanyWithBanks(id);

    if (payload.nombre !== undefined) {
      company.nombre = this.normalizeRequired(payload.nombre, "nombre");
    }
    if (payload.ruc !== undefined) company.ruc = this.normalizeOptional(payload.ruc);
    if (payload.email !== undefined) company.email = this.normalizeOptional(payload.email);
    if (payload.telefono !== undefined) company.telefono = this.normalizeOptional(payload.telefono);
    if (payload.direccion !== undefined) company.direccion = this.normalizeOptional(payload.direccion);
    if (payload.activo !== undefined) company.activo = payload.activo;

    try {
      await this.companyRepository.save(company);
      return this.requirePublicCompany(company.id);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async addBank(companyId: number, payload: CreateCompanyBankDto): Promise<PublicCompanyBank> {
    const company = await this.requireCompany(companyId);

    const bank = this.companyBankRepository.create({
      empresa: company,
      bancoNombre: this.normalizeRequired(payload.bancoNombre, "bancoNombre"),
      tipoCuenta: this.normalizeRequired(payload.tipoCuenta, "tipoCuenta"),
      moneda: this.normalizeRequired(payload.moneda, "moneda").toUpperCase(),
      numeroCuenta: this.normalizeRequired(payload.numeroCuenta, "numeroCuenta"),
      titular: this.normalizeOptional(payload.titular),
      sucursal: this.normalizeOptional(payload.sucursal),
      activo: payload.activo ?? true
    });

    try {
      const created = await this.companyBankRepository.save(bank);
      return this.toPublicCompanyBank(created);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async updateBank(
    companyId: number,
    bankId: number,
    payload: UpdateCompanyBankDto
  ): Promise<PublicCompanyBank> {
    const bank = await this.requireBank(companyId, bankId);

    if (payload.bancoNombre !== undefined) {
      bank.bancoNombre = this.normalizeRequired(payload.bancoNombre, "bancoNombre");
    }
    if (payload.tipoCuenta !== undefined) {
      bank.tipoCuenta = this.normalizeRequired(payload.tipoCuenta, "tipoCuenta");
    }
    if (payload.moneda !== undefined) {
      bank.moneda = this.normalizeRequired(payload.moneda, "moneda").toUpperCase();
    }
    if (payload.numeroCuenta !== undefined) {
      bank.numeroCuenta = this.normalizeRequired(payload.numeroCuenta, "numeroCuenta");
    }
    if (payload.titular !== undefined) bank.titular = this.normalizeOptional(payload.titular);
    if (payload.sucursal !== undefined) bank.sucursal = this.normalizeOptional(payload.sucursal);
    if (payload.activo !== undefined) bank.activo = payload.activo;

    try {
      const updated = await this.companyBankRepository.save(bank);
      return this.toPublicCompanyBank(updated);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async deleteBank(companyId: number, bankId: number): Promise<{ deleted: true }> {
    const bank = await this.requireBank(companyId, bankId);
    await this.companyBankRepository.remove(bank);
    return { deleted: true };
  }

  async findActiveCompanyById(id: number): Promise<Company | null> {
    return this.companyRepository.findOne({
      where: { id, activo: true }
    });
  }

  private async requireCompany(id: number): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException("Empresa no encontrada.");
    }

    return company;
  }

  private async requireCompanyWithBanks(id: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: { bancos: true }
    });

    if (!company) {
      throw new NotFoundException("Empresa no encontrada.");
    }

    return company;
  }

  private async requirePublicCompany(id: number): Promise<PublicCompany> {
    const company = await this.requireCompanyWithBanks(id);
    return this.toPublicCompany(company);
  }

  private async requireBank(companyId: number, bankId: number): Promise<CompanyBank> {
    const bank = await this.companyBankRepository.findOne({
      where: {
        id: bankId,
        empresa: { id: companyId }
      },
      relations: { empresa: true }
    });

    if (!bank) {
      throw new NotFoundException("Banco de empresa no encontrado.");
    }

    return bank;
  }

  private toPublicCompany(company: Company): PublicCompany {
    return {
      id: company.id,
      nombre: company.nombre,
      ruc: company.ruc,
      email: company.email,
      telefono: company.telefono,
      direccion: company.direccion,
      activo: company.activo,
      bancos: (company.bancos ?? []).map((bank) => this.toPublicCompanyBank(bank))
    };
  }

  private toPublicCompanyBank(bank: CompanyBank): PublicCompanyBank {
    return {
      id: bank.id,
      bancoNombre: bank.bancoNombre,
      tipoCuenta: bank.tipoCuenta,
      moneda: bank.moneda,
      numeroCuenta: bank.numeroCuenta,
      titular: bank.titular,
      sucursal: bank.sucursal,
      activo: bank.activo
    };
  }

  private normalizeOptional(value?: string): string | null {
    if (value === undefined) return null;
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
      const driverError = (error as QueryFailedError & { driverError?: { code?: string; detail?: string } })
        .driverError;
      const code = driverError?.code;
      const detail = String(driverError?.detail ?? "").toLowerCase();

      if (code === "23505") {
        if (detail.includes("emp_nombre")) {
          throw new ConflictException("El nombre de la empresa ya existe.");
        }
        if (detail.includes("emp_ruc")) {
          throw new ConflictException("El RUC de la empresa ya existe.");
        }
        if (detail.includes("eba_numero_cuenta")) {
          throw new ConflictException("Ya existe ese numero de cuenta para la empresa.");
        }
        throw new ConflictException("Ya existe un registro con datos unicos.");
      }
    }

    throw error;
  }
}
