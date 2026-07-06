import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
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
    const user =
      input.role === "ADMIN" ? await this.tryAdmin(input) : await this.tryStaff(input);
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

    const loginOk = input.login.trim().toLowerCase() === email.trim().toLowerCase();
    if (!loginOk || !safeEqual(input.password, password)) return null;
    return { id: "admin", email, username: null, fname: "Admin", lname: "", role: "ADMIN" };
  }

  /** PARTNER or EMPLOYEE — the stored account's role must match the tab the user picked. */
  private async tryStaff(input: LoginInput): Promise<AuthUser | null> {
    const stored = await this.users.findByLogin(input.login);
    if (!stored || stored.role !== input.role) return null;
    if (!verifyPassword(input.password, stored.passwordHash)) return null;
    if (stored.status === "PENDING") {
      throw new ForbiddenException("Your signup is awaiting admin approval.");
    }
    return {
      id: stored.id,
      email: stored.email,
      username: stored.username,
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
