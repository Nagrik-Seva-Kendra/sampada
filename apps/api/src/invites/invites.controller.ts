import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AcceptInviteInput, CreateInviteInput, type AuthResponse, type InviteItem, type InviteLink } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { PermissionGuard } from "../auth/permission.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { InviteService } from "./invite.service.js";

@Controller("invites")
export class InvitesController {
  constructor(private readonly invites: InviteService) {}

  @Post()
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("members.invite")
  async create(@Body() body: unknown, @CurrentUser() user: StaffUser): Promise<InviteLink> {
    return this.invites.createInvite(user.id, CreateInviteInput.parse(body));
  }

  @Get()
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("members.invite")
  async list(): Promise<InviteItem[]> {
    return this.invites.listInvites();
  }

  @Delete(":id")
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("members.invite")
  async revoke(@Param("id") id: string): Promise<void> {
    await this.invites.revokeInvite(id);
  }

  /** Public: consumes an invite token, creates the account, logs them in immediately. */
  @Post("accept")
  async accept(@Body() body: unknown): Promise<AuthResponse> {
    const input = AcceptInviteInput.parse(body);
    return this.invites.acceptInvite(input.token, input);
  }
}
