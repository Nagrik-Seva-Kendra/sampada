import { Module } from "@nestjs/common";
import { DeedExtractorService } from "./deed-extractor.service.js";
import { DraftIntakeService } from "./draft-intake.service.js";
import { GuidelineLookupService } from "./guideline-lookup.service.js";
import { WaRequestsController } from "./wa-requests.controller.js";
import { WaRequestsService } from "./wa-requests.service.js";
import { WhatsappBootstrapService } from "./whatsapp-bootstrap.service.js";
import { WhatsappController } from "./whatsapp.controller.js";
import { WhatsappService } from "./whatsapp.service.js";

@Module({
  controllers: [WhatsappController, WaRequestsController],
  providers: [
    WhatsappService,
    WhatsappBootstrapService,
    WaRequestsService,
    DraftIntakeService,
    DeedExtractorService,
    GuidelineLookupService,
  ],
})
export class WhatsappModule {}
