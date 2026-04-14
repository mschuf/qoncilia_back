import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { ConciliationKpiQueryDto } from "./dto/conciliation-kpi-query.dto";
import { CreateLayoutDto } from "./dto/create-layout.dto";
import { CreateUserBankDto } from "./dto/create-user-bank.dto";
import { ListReconciliationsQueryDto } from "./dto/list-reconciliations-query.dto";
import { PreviewReconciliationDto } from "./dto/preview-reconciliation.dto";
import { SaveReconciliationDto } from "./dto/save-reconciliation.dto";
import { UpdateLayoutDto } from "./dto/update-layout.dto";
import { UpdateUserBankDto } from "./dto/update-user-bank.dto";
import { ConciliationService } from "./conciliation.service";

type UploadedMemoryFile = {
  buffer: Buffer;
  originalname: string;
};

type UploadedFilesMap = {
  systemFile?: UploadedMemoryFile[];
  bankFile?: UploadedMemoryFile[];
};

@Controller("conciliation")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConciliationController {
  constructor(private readonly conciliationService: ConciliationService) {}

  @Get("catalog")
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  listCatalog(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.conciliationService.listCatalog(actor, query.userId);
  }

  @Post("users/:userId/banks")
  @Roles(Role.SUPERADMIN)
  createUserBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Body() body: CreateUserBankDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.createUserBank(userId, body, actor);
  }

  @Patch("users/:userId/banks/:bankId")
  @Roles(Role.SUPERADMIN)
  updateUserBank(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: UpdateUserBankDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateUserBank(userId, bankId, body, actor);
  }

  @Post("users/:userId/banks/:bankId/layouts")
  @Roles(Role.SUPERADMIN)
  createLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Body() body: CreateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.createLayout(userId, bankId, body, actor);
  }

  @Patch("users/:userId/banks/:bankId/layouts/:layoutId")
  @Roles(Role.SUPERADMIN)
  updateLayout(
    @Param("userId", ParseIntPipe) userId: number,
    @Param("bankId", ParseIntPipe) bankId: number,
    @Param("layoutId", ParseIntPipe) layoutId: number,
    @Body() body: UpdateLayoutDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.updateLayout(userId, bankId, layoutId, body, actor);
  }

  @Post("preview")
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "systemFile", maxCount: 1 },
        { name: "bankFile", maxCount: 1 }
      ],
      {
        limits: {
          fileSize: 10 * 1024 * 1024
        }
      }
    )
  )
  preview(
    @Body() body: PreviewReconciliationDto,
    @UploadedFiles() files: UploadedFilesMap,
    @CurrentUser() actor: AuthUser
  ) {
    return this.conciliationService.buildPreview(
      actor,
      body,
      files?.systemFile?.[0],
      files?.bankFile?.[0]
    );
  }

  @Post("reconciliations")
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  saveReconciliation(@Body() body: SaveReconciliationDto, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.saveReconciliation(actor, body);
  }

  @Get("reconciliations")
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  listReconciliations(@CurrentUser() actor: AuthUser, @Query() query: ListReconciliationsQueryDto) {
    return this.conciliationService.listReconciliations(actor, query);
  }

  @Get("reconciliations/:id")
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  getReconciliation(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.conciliationService.getReconciliation(actor, id);
  }

  @Get("kpis")
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  getKpis(@CurrentUser() actor: AuthUser, @Query() query: ConciliationKpiQueryDto) {
    return this.conciliationService.getKpis(actor, query.userId);
  }
}
