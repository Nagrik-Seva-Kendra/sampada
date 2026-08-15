import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtPlatformAdminGuard } from "../auth/jwt-platform-admin.guard.js";
import { PlatformDeedStatsService } from "./platform-deed-stats.service.js";

/**
 * Platform back-office deed-activity stats (Phase 5). Platform-admin-only,
 * spans all organizations. Consumed by NSK ERP's "Sampada Management → Deed
 * Activity" page via its /sampada/deed-stats proxy.
 */
@Controller("platform/deed-stats")
@UseGuards(JwtPlatformAdminGuard)
export class PlatformDeedStatsController {
  constructor(private readonly service: PlatformDeedStatsService) {}

  @Get()
  get() {
    return this.service.getStats();
  }

  /** The deeds one party appears in — the drill-down behind their activity row. */
  @Get("parties/:partyId/deeds")
  partyDeeds(@Param("partyId") partyId: string) {
    return this.service.partyDeeds(partyId);
  }
}
