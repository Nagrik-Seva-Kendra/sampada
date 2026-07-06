import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { ProfileController } from "./profile.controller.js";
import { ProfilePhotoController } from "./profile-photo.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAdminGuard } from "./jwt-admin.guard.js";
import { JwtStaffGuard } from "./jwt-staff.guard.js";
import { UsersModule } from "../users/users.module.js";

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true, // JwtService available app-wide (guards in other modules)
      // No token expiry — users stay logged in until they explicitly log
      // out (session persists in localStorage on the client).
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? "dev-only-change-me",
      }),
    }),
  ],
  controllers: [AuthController, ProfileController, ProfilePhotoController],
  providers: [AuthService, JwtAdminGuard, JwtStaffGuard],
  exports: [JwtAdminGuard, JwtStaffGuard],
})
export class AuthModule {}
