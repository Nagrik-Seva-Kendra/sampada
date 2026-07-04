import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ContactController } from "./contact.controller.js";
import { ContactService } from "./contact.service.js";

@Module({
  imports: [AuthModule], // provides JwtAdminGuard for the admin list route
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
