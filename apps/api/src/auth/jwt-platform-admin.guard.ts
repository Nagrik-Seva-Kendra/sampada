import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../prisma/prisma.service.js";
import { TENANT_KEY } from "../tenant/tenant-context.js";

/**
 * Verifies a Bearer JWT and requires the account to be flagged
 * `isPlatformAdmin` — platform staff, not a customer role. Gates back-office
 * capabilities shared across every organization (e.g. the guideline PDF
 * library), where a regular org ADMIN would be the wrong scope: it's not
 * their data to manage on every other customer's behalf.
 */
@Injectable()
export class JwtPlatformAdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException("Login required.");

    let payload: {
      sub: string;
      email: string;
      role: string;
      name?: string;
      tokenVersion?: number;
      organizationId?: string;
      membershipId?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }

    // Re-verify against the live record: never trust role/version/platform-admin
    // status from an old token alone.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, role: true, tokenVersion: true, isPlatformAdmin: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Session is no longer valid.");
    }
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException("Session has been revoked. Please sign in again.");
    }
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException("Platform admin access required.");
    }

    if (payload.organizationId) {
      const membership = await this.prisma.membership.findFirst({
        where: { userId: payload.sub, organizationId: payload.organizationId, status: "ACTIVE" },
        select: { id: true, role: true },
      });
      if (membership) {
        this.cls.set(TENANT_KEY, {
          userId: payload.sub,
          organizationId: payload.organizationId,
          membershipId: membership.id,
          role: membership.role,
        });
      }
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name ?? payload.email,
    };
    return true;
  }
}
