import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export interface StaffUser {
  id: string;
  email: string;
  role: "ADMIN" | "PARTNER" | "EMPLOYEE";
  name: string;
}

/** Verifies a Bearer JWT and requires role ADMIN, PARTNER, or EMPLOYEE. */
@Injectable()
export class JwtStaffGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: StaffUser }>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException("Login required.");

    let payload: { sub: string; email: string; role: string; name?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }

    if (payload.role !== "ADMIN" && payload.role !== "PARTNER" && payload.role !== "EMPLOYEE") {
      throw new ForbiddenException("Staff access required.");
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
