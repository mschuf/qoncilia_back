import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiredModule } from "../common/decorators/required-module.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AppModuleCode } from "../common/enums/app-module-code.enum";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { BankingService } from "./banking.service";
import { CreateBankDto } from "./dto/create-bank.dto";
import { CreateCompanyBankAccountDto } from "./dto/create-company-bank-account.dto";
import { ListCompanyBankingQueryDto } from "./dto/list-company-banking-query.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { UpdateCompanyBankAccountDto } from "./dto/update-company-bank-account.dto";

@Controller("company-banking")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  @Get("reference")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  listReference(@CurrentUser() actor: AuthUser, @Query() query: ListCompanyBankingQueryDto) {
    return this.bankingService.listReference(actor, query);
  }

  @Post("banks")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createBank(@Body() body: CreateBankDto, @CurrentUser() actor: AuthUser) {
    return this.bankingService.createBank(body, actor);
  }

  @Patch("banks/:bankId")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateBank(
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: UpdateBankDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.bankingService.updateBank(bankId, body, actor);
  }

  @Post("accounts")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  createCompanyBankAccount(
    @Body() body: CreateCompanyBankAccountDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.bankingService.createCompanyBankAccount(body, actor);
  }

  @Patch("accounts/:accountId")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
  @RequiredModule(AppModuleCode.LAYOUT_MANAGEMENT)
  updateCompanyBankAccount(
    @Param("accountId", ParseIntPipe) accountId: number,
    @Body() body: UpdateCompanyBankAccountDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.bankingService.updateCompanyBankAccount(accountId, body, actor);
  }
}
