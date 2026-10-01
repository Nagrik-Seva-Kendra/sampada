import { Module } from "@nestjs/common";
import { SpeechService } from "./speech.service.js";
import { TaskExtractorService } from "./task-extractor.service.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

@Module({
  controllers: [TasksController],
  providers: [TasksService, SpeechService, TaskExtractorService],
  exports: [TasksService, SpeechService, TaskExtractorService],
})
export class TasksModule {}
