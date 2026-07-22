import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";
import { PasswordResetService } from "./password-reset.service.js";

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordResetService],
  exports: [UsersService, PasswordResetService],
})
export class UsersModule {}
