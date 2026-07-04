import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { LoginInput } from "@sampada/shared";
import { AuthService } from "./auth.service.js";
import { JwtAdminGuard } from "./jwt-admin.guard.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/login → { accessToken, user }. */
  @Post("login")
  login(@Body() body: unknown) {
    return this.auth.login(LoginInput.parse(body));
  }

  /** GET /auth/me → current admin (requires valid token). */
  @Get("me")
  @UseGuards(JwtAdminGuard)
  me(@Req() req: Request & { user?: unknown }) {
    return req.user;
  }
}
