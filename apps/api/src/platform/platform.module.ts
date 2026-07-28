import { Module } from "@nestjs/common";
import { PlatformOrganizationsController } from "./platform-organizations.controller.js";
import { PlatformOrganizationsService } from "./platform-organizations.service.js";

@Module({
  controllers: [PlatformOrganizationsController],
  providers: [PlatformOrganizationsService],
})
export class PlatformModule {}
