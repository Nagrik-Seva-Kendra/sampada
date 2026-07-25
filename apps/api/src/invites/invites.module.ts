import { Module } from "@nestjs/common";
import { InvitesController } from "./invites.controller.js";
import { InviteService } from "./invite.service.js";
import { UsersModule } from "../users/users.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [InvitesController],
  providers: [InviteService],
})
export class InvitesModule {}
