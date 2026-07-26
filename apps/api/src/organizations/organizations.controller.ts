import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { OrgSignupInput, type AuthResponse } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { PermissionGuard } from "../auth/permission.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** Public: creates a new named org + its founding Owner, logs them in immediately. */
  @Post("signup")
  async signup(@Body() body: unknown): Promise<AuthResponse> {
    return this.organizations.signup(OrgSignupInput.parse(body));
  }

  /** Public: onboarding entry point — same as signup(), kept as a distinct route for the app's /onboarding page. */
  @Post("onboard")
  async onboard(@Body() body: unknown): Promise<AuthResponse> {
    return this.organizations.signup(OrgSignupInput.parse(body));
  }

  /** Owner-only: soft-delete (deactivate, recoverable) the caller's own organization. */
  @Post("delete")
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("org.delete")
  async deleteOwn(): Promise<{ ok: true }> {
    await this.organizations.deleteOwn();
    return { ok: true };
  }
}
