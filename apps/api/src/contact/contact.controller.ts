import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ContactInput } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { ContactService } from "./contact.service.js";

@Controller("contact")
export class ContactController {
  constructor(private readonly service: ContactService) {}

  /** Public: submit an enquiry. */
  @Post()
  submit(@Body() body: unknown) {
    return this.service.submit(ContactInput.parse(body));
  }

  /** Admin only: read submitted messages. */
  @Get()
  @UseGuards(JwtAdminGuard)
  list() {
    return this.service.list();
  }
}
