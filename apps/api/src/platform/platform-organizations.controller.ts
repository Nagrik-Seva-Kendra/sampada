import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PlatformUpdateMembershipInput } from "@sampada/shared";
import { JwtPlatformAdminGuard } from "../auth/jwt-platform-admin.guard.js";
import { PlatformOrganizationsService } from "./platform-organizations.service.js";

/**
 * Platform back-office (Phase 5 from SAAS_HANDOFF.md) — every route here is
 * platform-admin-only and spans organizations the caller isn't necessarily a
 * member of. Powers the "Sampada management" app in the ERP shell.
 */
@Controller("platform/organizations")
@UseGuards(JwtPlatformAdminGuard)
export class PlatformOrganizationsController {
  constructor(private readonly service: PlatformOrganizationsService) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("district") district?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.list({
      search: search?.trim() || undefined,
      district: district?.trim() || undefined,
      cursor: cursor || undefined,
      limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
    });
  }

  /** Declared above ":id" so "districts" is never read as an organization id. */
  @Get("districts")
  districts() {
    return this.service.districts();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.getDetail(id);
  }

  /** Reversible: blocks the org's access immediately (revokes every member's session). */
  @Post(":id/suspend")
  suspend(@Param("id") id: string) {
    return this.service.suspend(id).then(() => this.service.getDetail(id));
  }

  /** Restores a suspended org to normal access. */
  @Post(":id/reactivate")
  reactivate(@Param("id") id: string) {
    return this.service.reactivate(id).then(() => this.service.getDetail(id));
  }

  /** Terminal — same effect as the owner's own self-delete, never a hard delete. */
  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.service.cancel(id).then(() => this.service.getDetail(id));
  }

  @Patch(":id/memberships/:membershipId")
  updateMembership(@Param("id") id: string, @Param("membershipId") membershipId: string, @Body() body: unknown) {
    const input = PlatformUpdateMembershipInput.parse(body);
    return this.service.updateMembership(id, membershipId, input);
  }
}
