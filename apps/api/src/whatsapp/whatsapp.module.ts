import { Module } from "@nestjs/common";
import { DeedExtractorService } from "./deed-extractor.service.js";
import { DraftIntakeService } from "./draft-intake.service.js";
import { DraftReviewService } from "./draft-review.service.js";
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
  controllers: [WhatsappController, WaRequestsController, WaTemplatesController],
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
  ],
})
export class WhatsappModule {}
