import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { LoginInput, RefreshInput, ResetPasswordInput } from "@sampada/shared";
import { AuthService } from "./auth.service.js";
import { PasswordResetService } from "../users/password-reset.service.js";
import { JwtAdminGuard } from "./jwt-admin.guard.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /** POST /auth/login → { accessToken, refreshToken, user }. */
  @Post("login")
  login(@Body() body: unknown) {
    return this.auth.login(LoginInput.parse(body));
  }

  /** POST /auth/refresh → a fresh { accessToken, refreshToken, user } pair (rotation). */
  @Post("refresh")
  refresh(@Body() body: unknown) {
    return this.auth.refresh(RefreshInput.parse(body));
  }

  /** POST /auth/reset-password → consume an admin-issued reset link and set a new password. */
  @Post("reset-password")
  async resetPassword(@Body() body: unknown): Promise<{ ok: true }> {
    const input = ResetPasswordInput.parse(body);
    await this.passwordReset.consume(input.token, input.password);
    return { ok: true };
  }

  /** GET /auth/me → current admin (requires valid token). */
  @Get("me")
  @UseGuards(JwtAdminGuard)
  me(@Req() req: Request & { user?: unknown }) {
    return req.user;
  }
}
