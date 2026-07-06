import { Module } from "@nestjs/common";
import { DeedsController } from "./deeds.controller.js";
import { DeedsService } from "./deeds.service.js";
import { SampleDeedsController } from "./sample-deeds.controller.js";
import { SampleDeedsService } from "./sample-deeds.service.js";

@Module({
  controllers: [DeedsController, SampleDeedsController],
  providers: [DeedsService, SampleDeedsService],
  exports: [DeedsService, SampleDeedsService],
})
export class DeedsModule {}
