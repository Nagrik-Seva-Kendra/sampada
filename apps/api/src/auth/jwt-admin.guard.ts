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

/** Verifies a Bearer JWT, requires role ADMIN, and enforces session revocation. */
@Injectable()
export class JwtAdminGuard implements CanActivate {
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

    if (payload.role !== "ADMIN") throw new ForbiddenException("Admin access required.");

    // Re-verify against the live record: never trust role/version from an old token alone.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, role: true, tokenVersion: true },
    });
    if (!user || user.status !== "ACTIVE" || user.role !== "ADMIN") {
      throw new UnauthorizedException("Session is no longer valid.");
    }
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException("Session has been revoked. Please sign in again.");
    }

    // Establish tenant context for this request: re-verify the membership is
    // still ACTIVE (never trust the token's org claim alone), then populate CLS
    // so the Prisma tenant-scope extension can enforce isolation downstream.
    if (payload.organizationId) {
      const membership = await this.prisma.membership.findFirst({
        where: { userId: payload.sub, organizationId: payload.organizationId, status: "ACTIVE" },
        select: { id: true, role: true },
      });
      if (!membership) {
        throw new UnauthorizedException("Your organization membership is no longer active.");
      }
      this.cls.set(TENANT_KEY, {
        userId: payload.sub,
        organizationId: payload.organizationId,
        membershipId: membership.id,
        role: membership.role,
      });
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
