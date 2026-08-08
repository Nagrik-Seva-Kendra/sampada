import { Module } from "@nestjs/common";
import { SampleDeedsController } from "./sample-deeds.controller.js";
import { SampleDeedsService } from "./sample-deeds.service.js";
import { DeedDocumentsController } from "./deed-documents.controller.js";
import { DeedDocumentsService } from "./deed-documents.service.js";
import { DeedPropertyDetailController } from "./deed-property-detail.controller.js";
import { DeedPropertyDetailService } from "./deed-property-detail.service.js";
import { PublicDeedsController } from "./public-deeds.controller.js";
import { PublicDeedDocumentsController } from "./public-deed-documents.controller.js";
import { DeedLiveService } from "./deed-live.service.js";
import { DeedPresenceController } from "./deed-presence.controller.js";
import { DeedPresenceService } from "./deed-presence.service.js";
import { DeedVisibleGuard } from "./deed-visible.guard.js";
import { PublicDeedTenantInterceptor } from "../tenant/public-deed-tenant.interceptor.js";

@Module({
  controllers: [
    SampleDeedsController,
    DeedDocumentsController,
    DeedPropertyDetailController,
    DeedPresenceController,
    PublicDeedsController,
    PublicDeedDocumentsController,
  ],
  providers: [
    SampleDeedsService,
    DeedDocumentsService,
    DeedPropertyDetailService,
    DeedLiveService,
    DeedPresenceService,
    DeedVisibleGuard,
    PublicDeedTenantInterceptor,
  ],
  exports: [SampleDeedsService],
})
export class DeedsModule {}
