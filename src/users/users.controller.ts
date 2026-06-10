import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiredModule } from "../common/decorators/required-module.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AppModuleCode } from "../common/enums/app-module-code.enum";
import { Role } from "../common/enums/role.enum";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(Role.ADMIN, Role.IS_SUPER_ADMIN)
@RequiredModule(AppModuleCode.USERS)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("list")
  listUsers(@CurrentUser() actor: AuthUser) {
    return this.usersService.listUsers(actor);
  }

  @Post("create")
  createUser(@Body() body: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.createFromAbm(body, actor);
  }

  @Patch("me")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.PROFILE)
  updateOwnProfile(@Body() body: UpdateProfileDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.updateOwnProfile(actor, body);
  }

  @Post("me/change-password")
  @Roles(Role.ADMIN, Role.IS_SUPER_ADMIN, Role.GESTOR_COBRANZA, Role.GESTOR_PAGOS)
  @RequiredModule(AppModuleCode.PROFILE)
  changeOwnPassword(@Body() body: ChangePasswordDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.changeOwnPassword(actor, body);
  }

  @Patch("update/:id")
  updateUser(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.usersService.updateUser(id, body, actor);
  }

  @Post(":id/reset-password")
  resetPassword(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.usersService.resetPassword(id, actor);
  }
}
