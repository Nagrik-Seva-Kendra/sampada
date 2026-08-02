import { Module } from "@nestjs/common";
import { PlatformOrganizationsController } from "./platform-organizations.controller.js";
import { PlatformOrganizationsService } from "./platform-organizations.service.js";
import { PlatformDeedStatsController } from "./platform-deed-stats.controller.js";
import { PlatformDeedStatsService } from "./platform-deed-stats.service.js";

@Module({
  controllers: [PlatformOrganizationsController, PlatformDeedStatsController],
  providers: [PlatformOrganizationsService, PlatformDeedStatsService],
})
export class PlatformModule {}
