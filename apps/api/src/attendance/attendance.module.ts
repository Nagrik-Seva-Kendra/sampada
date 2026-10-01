import { Module } from "@nestjs/common";
import { WaMessagingModule } from "../whatsapp/wa-messaging.module.js";
import { AttendanceExportService } from "./attendance-export.service.js";
import { AttendanceJobsService } from "./attendance-jobs.service.js";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { SalaryService } from "./salary.service.js";

@Module({
  imports: [WaMessagingModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, SalaryService, AttendanceExportService, AttendanceJobsService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
