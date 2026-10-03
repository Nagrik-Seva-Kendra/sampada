import { Module } from "@nestjs/common";
import { ArchiveRiskController } from "./archive-risk.controller.js";
import { ArchiveRiskService } from "./archive-risk.service.js";

@Module({ controllers: [ArchiveRiskController], providers: [ArchiveRiskService] })
export class ArchiveRiskModule {}
