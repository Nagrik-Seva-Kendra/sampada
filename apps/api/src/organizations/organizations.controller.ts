import { Body, Controller, Post } from "@nestjs/common";
import { OrgSignupInput, type AuthResponse } from "@sampada/shared";
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
}
