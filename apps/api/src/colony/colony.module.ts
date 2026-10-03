import { Module } from "@nestjs/common";
import { ColonyController } from "./colony.controller.js";
import { ColonyService } from "./colony.service.js";

@Module({
  controllers: [ColonyController],
  providers: [ColonyService],
  exports: [ColonyService],
})
export class ColonyModule {}
