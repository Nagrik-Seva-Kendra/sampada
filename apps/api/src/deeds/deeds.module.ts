import { Module } from "@nestjs/common";
import { SampleDeedsController } from "./sample-deeds.controller.js";
import { SampleDeedsService } from "./sample-deeds.service.js";

@Module({
  controllers: [SampleDeedsController],
  providers: [SampleDeedsService],
  exports: [SampleDeedsService],
})
export class DeedsModule {}
