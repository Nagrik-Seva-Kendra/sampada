import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { ArchiveRiskService } from "./archive-risk.service.js";

/** Archive risk check: request warnings (same access as the request), index run (OWNER/ADMIN). */
@Controller("archive-risk")
@UseGuards(JwtStaffGuard)
export class ArchiveRiskController {
  constructor(private readonly service: ArchiveRiskService) {}

  @Get("requests/:id")
  forRequest(@Param("id") id: string) {
    return this.service.forRequest(id);
  }

  @Post("index")
  runNow() {
    return this.service.runNow();
  }
}
