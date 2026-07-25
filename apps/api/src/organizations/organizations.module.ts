import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";
import { UsersModule } from "../users/users.module.js";
import { OtpModule } from "../otp/otp.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [UsersModule, OtpModule, AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
