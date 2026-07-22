import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service.js";

export interface StaffUser {
  id: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
}

/** Verifies a Bearer JWT, requires role ADMIN or EMPLOYEE, and enforces session revocation. */
@Injectable()
export class JwtStaffGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: StaffUser }>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException("Login required.");

    let payload: { sub: string; email: string; role: string; name?: string; tokenVersion?: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }

    if (payload.role !== "ADMIN" && payload.role !== "EMPLOYEE") {
      throw new ForbiddenException("Staff access required.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, role: true, tokenVersion: true },
    });
    if (!user || user.status !== "ACTIVE" || (user.role !== "ADMIN" && user.role !== "EMPLOYEE")) {
      throw new UnauthorizedException("Session is no longer valid.");
    }
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException("Session has been revoked. Please sign in again.");
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
