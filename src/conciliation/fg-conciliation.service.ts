import { ForbiddenException, Injectable } from "@nestjs/common"
import { AuthUser } from "../common/interfaces/auth-user.interface"
import { CompareBankStatementDto } from "./dto/compare-bank-statement.dto"
import { CreateBankStatementDto, PreviewBankStatementDto } from "./dto/create-bank-statement.dto"
import { ListBankStatementsQueryDto } from "./dto/list-bank-statements-query.dto"
import { ConciliationService } from "./conciliation.service"

type UploadedMemoryFile = {
  buffer: Buffer
  originalname: string
}

@Injectable()
export class FgConciliationService {
  constructor(private readonly conciliationService: ConciliationService) {}

  listCatalog(actor: AuthUser, requestedUserId?: number) {
    this.ensureFgQa(actor)
    return this.conciliationService.listCatalog(actor, requestedUserId)
  }

  previewBankStatement(actor: AuthUser, payload: PreviewBankStatementDto, file?: UploadedMemoryFile) {
    this.ensureFgQa(actor)
    return this.conciliationService.previewBankStatement(actor, payload, file)
  }

  createBankStatement(actor: AuthUser, payload: CreateBankStatementDto, file?: UploadedMemoryFile) {
    this.ensureFgQa(actor)
    return this.conciliationService.createBankStatement(actor, payload, file)
  }

  processBankStatementWithSapB1(
    actor: AuthUser,
    payload: CreateBankStatementDto,
    file?: UploadedMemoryFile
  ) {
    this.ensureFgQa(actor)
    return this.conciliationService.processBankStatementWithSapB1(actor, payload, file)
  }

  getSapB1BankStatementConfigStatus(actor: AuthUser, requestedUserId?: number) {
    this.ensureFgQa(actor)
    return this.conciliationService.getSapB1BankStatementConfigStatus(actor, requestedUserId)
  }

  listBankStatements(actor: AuthUser, query: ListBankStatementsQueryDto) {
    this.ensureFgQa(actor)
    return this.conciliationService.listBankStatements(actor, query)
  }

  getBankStatement(actor: AuthUser, statementId: number) {
    this.ensureFgQa(actor)
    return this.conciliationService.getBankStatement(actor, statementId)
  }

  deleteBankStatement(actor: AuthUser, statementId: number) {
    this.ensureFgQa(actor)
    return this.conciliationService.deleteBankStatement(actor, statementId)
  }

  compareBankStatement(actor: AuthUser, payload: CompareBankStatementDto, file?: UploadedMemoryFile) {
    this.ensureFgQa(actor)
    return this.conciliationService.compareBankStatement(actor, payload, file)
  }

  private ensureFgQa(actor: AuthUser): void {
    if (!new Set(["5629621_QA", "5629621"]).has(actor.companyCode.trim().toUpperCase())) {
      throw new ForbiddenException(
        "Este modulo de conciliacion bancaria FG esta habilitado solamente para empresas FG autorizadas."
      )
    }
  }
}
