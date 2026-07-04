import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GuidelineDocsController } from "./guideline-docs.controller.js";
import { GuidelineDocsService } from "./guideline-docs.service.js";

@Module({
  imports: [AuthModule], // provides JwtAdminGuard
  controllers: [GuidelineDocsController],
  providers: [GuidelineDocsService],
})
export class GuidelineDocsModule {}
