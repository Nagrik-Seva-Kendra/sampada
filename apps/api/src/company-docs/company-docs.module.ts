import { Module } from "@nestjs/common";
import { SitesController } from "./sites.controller.js";
import { CompanyDocsController } from "./company-docs.controller.js";
import { SitesService } from "./sites.service.js";
import { CompanyDocsService } from "./company-docs.service.js";

@Module({
  controllers: [SitesController, CompanyDocsController],
  providers: [SitesService, CompanyDocsService],
})
export class CompanyDocsModule {}
