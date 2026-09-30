import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { WaTemplatesService } from "./wa-templates.service.js";

/** WhatsApp message templates (for messages outside the 24h window). OWNER/ADMIN only. */
@Controller("whatsapp/templates")
@UseGuards(JwtStaffGuard)
export class WaTemplatesController {
  constructor(private readonly service: WaTemplatesService) {}

  @Get()
  status() {
    return this.service.status();
  }

  /** Sends the templates in WA_TEMPLATES to Meta for approval (skips ones already there). */
  @Post("submit")
  submit() {
    return this.service.submit();
  }
}
