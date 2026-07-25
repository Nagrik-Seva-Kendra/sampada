import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { ProfileController } from "./profile.controller.js";
import { ProfilePhotoController } from "./profile-photo.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAdminGuard } from "./jwt-admin.guard.js";
import { JwtStaffGuard } from "./jwt-staff.guard.js";
import { PermissionGuard } from "./permission.guard.js";
import { UsersModule } from "../users/users.module.js";

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true, // JwtService available app-wide (guards in other modules)
      // Access tokens are short-lived (expiry set per-sign in AuthService);
      // refresh tokens (signed with JWT_REFRESH_SECRET) rotate them. This
      // secret verifies access tokens in the guards.
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? "dev-only-change-me",
      }),
    }),
  ],
  controllers: [AuthController, ProfileController, ProfilePhotoController],
  providers: [AuthService, JwtAdminGuard, JwtStaffGuard, PermissionGuard],
  exports: [AuthService, JwtAdminGuard, JwtStaffGuard, PermissionGuard],
})
export class AuthModule {}
