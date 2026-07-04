import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAdminGuard } from "./jwt-admin.guard.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true, // JwtService available app-wide (guards in other modules)
      // No token expiry — the admin stays logged in until they explicitly log
      // out (session persists in localStorage on the client).
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? "dev-only-change-me",
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAdminGuard],
  exports: [JwtAdminGuard],
})
export class AuthModule {}
