import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { timingSafeEqual } from "node:crypto";
import type { AuthResponse, AuthUser, LoginInput } from "@sampada/shared";

/**
 * Interim admin auth: validates against ADMIN_EMAIL / ADMIN_PASSWORD env vars
 * and issues a JWT. TODO: back with a users table + argon2 hashes in the DB phase.
 */
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(input: LoginInput): Promise<AuthResponse> {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      throw new UnauthorizedException("Admin login is not configured (set ADMIN_EMAIL / ADMIN_PASSWORD).");
    }

    const emailOk = input.email.trim().toLowerCase() === email.trim().toLowerCase();
    const passOk = safeEqual(input.password, password);
    if (!emailOk || !passOk) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const user: AuthUser = { id: "admin", email, fname: "Admin", lname: "", role: "ADMIN" };
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, user };
  }
}

/** Constant-time string comparison (avoids leaking password length/timing). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
