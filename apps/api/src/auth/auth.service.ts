import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import type { AuthResponse, AuthUser, LoginInput, RefreshInput } from "@sampada/shared";
import { UsersService, type StoredUser } from "../users/users.service.js";

/** Short-lived access token; a stale one is refreshed via POST /auth/refresh. */
const ACCESS_TTL = (process.env.JWT_ACCESS_TTL ?? "15m") as JwtSignOptions["expiresIn"];
/** Long-lived refresh token; rotated on every use. */
const REFRESH_TTL = (process.env.JWT_REFRESH_TTL ?? "30d") as JwtSignOptions["expiresIn"];

/** Refresh tokens are signed with a distinct secret so an access token can never be replayed as one. */
function refreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? "dev-only-change-me";
}

/** ADMIN and EMPLOYEE both authenticate the same way: a User row + argon2id password hash. */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  /** POST /auth/login — verify credentials and issue an access + refresh pair. */
  async login(input: LoginInput): Promise<AuthResponse> {
    const stored = await this.tryLogin(input);
    if (!stored) throw new UnauthorizedException("Invalid email or password.");
    return this.issueSession(stored);
  }

  /**
   * POST /auth/refresh — exchange a valid refresh token for a fresh pair
   * (rotation). Rejects if the user is gone, inactive, or the token's
   * tokenVersion is stale (i.e. the session was revoked).
   */
  async refresh(input: RefreshInput): Promise<AuthResponse> {
    let payload: { sub: string; tokenVersion?: number; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(input.refreshToken, { secret: refreshSecret() });
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }
    if (payload.typ !== "refresh") throw new UnauthorizedException("Invalid session.");

    const stored = await this.users.findById(payload.sub);
    if (!stored) throw new UnauthorizedException("Invalid session.");
    if (stored.status !== "ACTIVE") {
      throw new ForbiddenException("Your account is no longer active.");
    }
    if ((payload.tokenVersion ?? 0) !== stored.tokenVersion) {
      throw new UnauthorizedException("Session has been revoked. Please sign in again.");
    }
    return this.issueSession(stored);
  }

  /** Mint an access + refresh pair for an authenticated user, both stamped with the current tokenVersion. */
  async issueSession(stored: StoredUser): Promise<AuthResponse> {
    // Org context for tenant scoping: the user's active membership (if any).
    const membership = await this.users.resolveActiveMembership(stored.id);
    if (membership) {
      await this.users.setLastActiveOrganization(stored.id, membership.organizationId);
    }
    const user: AuthUser = {
      id: stored.id,
      email: stored.email,
      username: stored.username,
      fname: stored.fname,
      lname: stored.lname,
      role: stored.role,
      isPlatformAdmin: stored.isPlatformAdmin,
      activeOrganization: membership
        ? {
            id: membership.organizationId,
            name: membership.organization.name,
            slug: membership.organization.slug,
            status: membership.organization.status,
            role: membership.role,
          }
        : null,
    };
    const accessToken = await this.jwt.signAsync(
      {
        sub: stored.id,
        email: stored.email,
        role: stored.role,
        name: `${stored.fname} ${stored.lname}`.trim(),
        tokenVersion: stored.tokenVersion,
        typ: "access",
        ...(membership
          ? {
              organizationId: membership.organizationId,
              membershipId: membership.id,
              orgRole: membership.role,
            }
          : {}),
      },
      { expiresIn: ACCESS_TTL },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: stored.id, tokenVersion: stored.tokenVersion, typ: "refresh" },
      { secret: refreshSecret(), expiresIn: REFRESH_TTL },
    );
    return { accessToken, refreshToken, user };
  }

  /** No role tab to pick anymore — the account's own stored role decides admin vs. employee. */
  private async tryLogin(input: LoginInput): Promise<StoredUser | null> {
    const stored = await this.users.findByLogin(input.login);
    if (!stored) return null;
    if (!(await this.users.verifyCredentials(stored, input.password))) return null;
    if (stored.status === "PENDING") {
      throw new ForbiddenException("Your signup is awaiting admin approval.");
    }
    if (stored.status === "INACTIVE") {
      throw new ForbiddenException("Your services have been discontinued by the admin.");
    }
    if (!(await this.users.hasLiveMembership(stored.id))) {
      throw new ForbiddenException("This organisation has been deleted.");
    }
    return stored;
  }
}
