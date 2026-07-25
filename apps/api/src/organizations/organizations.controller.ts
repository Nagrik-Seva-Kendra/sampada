import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  CreateOrganizationInput,
  OrgSignupInput,
  SwitchOrganizationInput,
  type AuthResponse,
  type OrganizationSummary,
} from "@sampada/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
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

  /** Authenticated: create an ADDITIONAL org for the current user; auto-switches into it. */
  @Post()
  @UseGuards(JwtStaffGuard)
  async create(@CurrentUser() user: StaffUser, @Body() body: unknown): Promise<AuthResponse> {
    return this.organizations.createAdditional(user.id, CreateOrganizationInput.parse(body));
  }

  /** Authenticated: switch which org the session acts under + reissue tokens. */
  @Post("switch")
  @UseGuards(JwtStaffGuard)
  async switch(@CurrentUser() user: StaffUser, @Body() body: unknown): Promise<AuthResponse> {
    return this.organizations.switchActive(user.id, SwitchOrganizationInput.parse(body).organizationId);
  }

  /** Authenticated: workspace switcher — every org the caller actively belongs to. */
  @Get("mine")
  @UseGuards(JwtStaffGuard)
  async mine(@CurrentUser() user: StaffUser): Promise<OrganizationSummary[]> {
    return this.organizations.listMine(user.id);
  }
}
