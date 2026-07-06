import { Module } from "@nestjs/common";
import { PartnersController } from "./partners.controller.js";
import { UsersModule } from "../users/users.module.js";
import { DeedsModule } from "../deeds/deeds.module.js";
import { OtpModule } from "../otp/otp.module.js";

@Module({
  imports: [UsersModule, DeedsModule, OtpModule],
  controllers: [PartnersController],
})
export class PartnersModule {}
