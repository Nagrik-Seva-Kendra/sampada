import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse, AuthUser, LoginInput } from "@sampada/shared";
import { UsersService, verifyPassword } from "../users/users.service.js";

/** ADMIN and EMPLOYEE both authenticate the same way: a User row + scrypt password hash. */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.tryLogin(input);
    if (!user) throw new UnauthorizedException("Invalid email or password.");

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: `${user.fname} ${user.lname}`.trim(),
    });
    return { accessToken, user };
  }

  /** The stored account's role must match the tab the user picked (admin/employee). */
  private async tryLogin(input: LoginInput): Promise<AuthUser | null> {
    const stored = await this.users.findByLogin(input.login);
    if (!stored || stored.role !== input.role) return null;
    if (!verifyPassword(input.password, stored.passwordHash)) return null;
    if (stored.status === "PENDING") {
      throw new ForbiddenException("Your signup is awaiting admin approval.");
    }
    if (stored.status === "INACTIVE") {
      throw new ForbiddenException("Your services have been discontinued by the admin.");
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
