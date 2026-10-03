import { Module } from "@nestjs/common";
import { AiDraftController } from "./ai-draft.controller.js";
import { AiDraftService } from "./ai-draft.service.js";

@Module({
  controllers: [AiDraftController],
  providers: [AiDraftService],
})
export class AiDraftModule {}
