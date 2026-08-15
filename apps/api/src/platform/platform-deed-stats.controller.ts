import { Controller, Get, UseGuards } from "@nestjs/common";
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
}
