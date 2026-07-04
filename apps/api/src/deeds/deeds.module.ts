import { Module } from "@nestjs/common";
import { DeedsController } from "./deeds.controller.js";
import { DeedsService } from "./deeds.service.js";

@Module({
  controllers: [DeedsController],
  providers: [DeedsService],
  exports: [DeedsService],
})
export class DeedsModule {}
