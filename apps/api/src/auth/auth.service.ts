import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { timingSafeEqual } from "node:crypto";
import type { AuthResponse, AuthUser, LoginInput } from "@sampada/shared";
import { UsersService, verifyPassword } from "../users/users.service.js";

/**
 * Interim auth: the ADMIN validates against ADMIN_EMAIL / ADMIN_PASSWORD env
 * vars; PARTNER accounts live in the disk user store (created by the admin).
 * TODO: move the admin into the users table too in the DB phase.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = (await this.tryAdmin(input)) ?? (await this.tryPartner(input));
    if (!user) throw new UnauthorizedException("Invalid email or password.");

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: `${user.fname} ${user.lname}`.trim(),
    });
    return { accessToken, user };
  }

  private async tryAdmin(input: LoginInput): Promise<AuthUser | null> {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return null;

    const emailOk = input.email.trim().toLowerCase() === email.trim().toLowerCase();
    if (!emailOk || !safeEqual(input.password, password)) return null;
    return { id: "admin", email, fname: "Admin", lname: "", role: "ADMIN" };
  }

  private async tryPartner(input: LoginInput): Promise<AuthUser | null> {
    const stored = await this.users.findByEmail(input.email);
    if (!stored || !verifyPassword(input.password, stored.passwordHash)) return null;
    return {
      id: stored.id,
      email: stored.email,
      fname: stored.fname,
      lname: stored.lname,
      role: stored.role,
    };
  }
}

/** Constant-time string comparison (avoids leaking password length/timing). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
