import { Module } from "@nestjs/common";
import { ColonyController } from "./colony.controller.js";
import { ColonyPaperExtractor } from "./colony-paper.js";
import { ColonyService } from "./colony.service.js";

@Module({
  controllers: [ColonyController],
  providers: [ColonyService, ColonyPaperExtractor],
  exports: [ColonyService],
})
export class ColonyModule {}
