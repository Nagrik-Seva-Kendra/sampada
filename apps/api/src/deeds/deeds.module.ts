import { Module } from "@nestjs/common";
import { SampleDeedsController } from "./sample-deeds.controller.js";
import { SampleDeedsService } from "./sample-deeds.service.js";
import { DeedDocumentsController } from "./deed-documents.controller.js";
import { DeedDocumentsService } from "./deed-documents.service.js";
import { PublicDeedsController } from "./public-deeds.controller.js";
import { PublicDeedDocumentsController } from "./public-deed-documents.controller.js";
import { DeedLiveService } from "./deed-live.service.js";

@Module({
  controllers: [SampleDeedsController, DeedDocumentsController, PublicDeedsController, PublicDeedDocumentsController],
  providers: [SampleDeedsService, DeedDocumentsService, DeedLiveService],
  exports: [SampleDeedsService],
})
export class DeedsModule {}
