import { Module } from "@nestjs/common";
import { GuidelineController } from "./guideline.controller.js";
import { GuidelineService } from "./guideline.service.js";

@Module({
    controllers: [GuidelineController],
    providers: [GuidelineService],
})
export class GuidelineModule {}
