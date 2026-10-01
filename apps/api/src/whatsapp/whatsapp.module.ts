import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module.js";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { TaskJobsService } from "./task-jobs.service.js";
import { DeedExtractorService } from "./deed-extractor.service.js";
import { DraftIntakeService } from "./draft-intake.service.js";
import { DraftReviewService } from "./draft-review.service.js";
import { FrontDoorService } from "./front-door.service.js";
import { IntentClassifierService } from "./intent-classifier.service.js";
import { WaAdminController, WaAdminService } from "./wa-admin.controller.js";
import { GuidelineLookupService } from "./guideline-lookup.service.js";
import { IdCardExtractorService } from "./id-card-extractor.service.js";
import { IdPhotoRetentionService } from "./id-photo-retention.service.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { WaRequestsController } from "./wa-requests.controller.js";
import { WaRequestsService } from "./wa-requests.service.js";
import { WaTemplatesController } from "./wa-templates.controller.js";
import { WaTemplatesService } from "./wa-templates.service.js";
import { WhatsappBootstrapService } from "./whatsapp-bootstrap.service.js";
import { WhatsappController } from "./whatsapp.controller.js";
import { WhatsappService } from "./whatsapp.service.js";

@Module({
  imports: [TasksModule],
  controllers: [WhatsappController, WaRequestsController, WaTemplatesController, WaAdminController],
  providers: [
    WhatsappService,
    WhatsappBootstrapService,
    WaRequestsService,
    DraftIntakeService,
    DeedExtractorService,
    GuidelineLookupService,
    IdCardExtractorService,
    IdPhotoRetentionService,
    WaOutboxService,
    WaTemplatesService,
    DraftReviewService,
    FrontDoorService,
    IntentClassifierService,
    WaAdminService,
    OwnerAssistantService,
    TaskJobsService,
  ],
})
export class WhatsappModule {}
