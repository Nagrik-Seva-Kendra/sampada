import { Module } from "@nestjs/common";
import { DeedExtractorService } from "./deed-extractor.service.js";
import { DraftIntakeService } from "./draft-intake.service.js";
import { GuidelineLookupService } from "./guideline-lookup.service.js";
import { WhatsappController } from "./whatsapp.controller.js";
import { WhatsappService } from "./whatsapp.service.js";

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, DraftIntakeService, DeedExtractorService, GuidelineLookupService],
})
export class WhatsappModule {}
