import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CompaniesService } from "./companies.service";
import { CreateCompanyBankDto } from "./dto/create-company-bank.dto";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyBankDto } from "./dto/update-company-bank.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get("options")
  listActiveOptions() {
    return this.companiesService.listActiveOptions();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  listCompanies() {
    return this.companiesService.listCompanies();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  createCompany(@Body() body: CreateCompanyDto) {
    return this.companiesService.createCompany(body);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  updateCompany(@Param("id", ParseIntPipe) id: number, @Body() body: UpdateCompanyDto) {
    return this.companiesService.updateCompany(id, body);
  }

  @Post(":companyId/banks")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  addBank(
    @Param("companyId", ParseIntPipe) companyId: number,
    @Body() body: CreateCompanyBankDto
  ) {
    return this.companiesService.addBank(companyId, body);
  }

  @Patch(":companyId/banks/:bankId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  updateBank(
    @Param("companyId", ParseIntPipe) companyId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: UpdateCompanyBankDto
  ) {
    return this.companiesService.updateBank(companyId, bankId, body);
  }

  @Delete(":companyId/banks/:bankId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  removeBank(
    @Param("companyId", ParseIntPipe) companyId: number,
    @Param("bankId", ParseIntPipe) bankId: number
  ) {
    return this.companiesService.deleteBank(companyId, bankId);
  }
}
