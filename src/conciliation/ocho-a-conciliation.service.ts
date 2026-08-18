import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto";
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto";
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto";
import { ConciliationService } from "./conciliation.service";

type UploadedMemoryFile = {
  buffer: Buffer;
  originalname: string;
};

// Punto de extension exclusivo de OCHO_A para Carga de extractos y
// Conciliacion de banco. Hoy delega al flujo validado; las reglas futuras se
// agregan aqui sin modificar ConciliationService para las demas empresas.
@Injectable()
export class OchoAConciliationService {
  constructor(private readonly conciliationService: ConciliationService) {}

  listCatalog(actor: AuthUser, requestedUserId?: number) {
    this.ensureOchoA(actor);
    return this.conciliationService.listCatalog(actor, requestedUserId);
  }

  previewBankStatement(actor: AuthUser, payload: PreviewBankStatementDto, file?: UploadedMemoryFile) {
    this.ensureOchoA(actor);
    return this.conciliationService.previewBankStatement(actor, payload, file);
  }

  createBankStatement(actor: AuthUser, payload: CreateBankStatementDto, file?: UploadedMemoryFile) {
    this.ensureOchoA(actor);
    return this.conciliationService.createBankStatement(actor, payload, file);
  }

  processBankStatementWithSapB1(
    actor: AuthUser,
    payload: CreateBankStatementDto,
    file?: UploadedMemoryFile
  ) {
    this.ensureOchoA(actor);
    return this.conciliationService.processBankStatementWithSapB1(actor, payload, file);
  }

  getSapB1BankStatementConfigStatus(actor: AuthUser, requestedUserId?: number) {
    this.ensureOchoA(actor);
    return this.conciliationService.getSapB1BankStatementConfigStatus(actor, requestedUserId);
  }

  listBankStatements(actor: AuthUser, query: ListBankStatementsQueryDto) {
    this.ensureOchoA(actor);
    return this.conciliationService.listBankStatements(actor, query);
  }

  getBankStatement(actor: AuthUser, statementId: number) {
    this.ensureOchoA(actor);
    return this.conciliationService.getBankStatement(actor, statementId);
  }

  deleteBankStatement(actor: AuthUser, statementId: number) {
    this.ensureOchoA(actor);
    return this.conciliationService.deleteBankStatement(actor, statementId);
  }

  compareBankStatement(actor: AuthUser, payload: CompareBankStatementDto, file?: UploadedMemoryFile) {
    this.ensureOchoA(actor);
    return this.conciliationService.compareBankStatement(actor, payload, file);
  }

  private ensureOchoA(actor: AuthUser): void {
    if (actor.companyCode.trim().toUpperCase() !== "OCHO_A") {
      throw new ForbiddenException(
        "Este modulo de conciliacion bancaria es exclusivo de OCHO A."
      );
    }
  }
}
