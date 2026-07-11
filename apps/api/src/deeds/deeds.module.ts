import { Module } from "@nestjs/common";
import { SampleDeedsController } from "./sample-deeds.controller.js";
import { SampleDeedsService } from "./sample-deeds.service.js";
import { DeedDocumentsController } from "./deed-documents.controller.js";
import { DeedDocumentsService } from "./deed-documents.service.js";

@Module({
  controllers: [SampleDeedsController, DeedDocumentsController],
  providers: [SampleDeedsService, DeedDocumentsService],
  exports: [SampleDeedsService],
})
export class DeedsModule {}
