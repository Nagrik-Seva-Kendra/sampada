import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import { hasPermission, type Permission } from "@sampada/shared";
import { getTenantContext, isPublicSentinel } from "../tenant/current-tenant.js";
import { PERMISSION_KEY } from "./require-permission.decorator.js";

/**
 * Checks the caller's org role against a route's @RequirePermission metadata.
 * Must run AFTER JwtStaffGuard/JwtAdminGuard, which populate the CLS tenant
 * context this guard reads: @UseGuards(JwtStaffGuard, PermissionGuard). A
 * route with no @RequirePermission metadata passes through unchanged — this
 * guard is opt-in per route, not a global default-deny (deny-by-default
 * already lives in the Prisma tenant-scope extension for data access).
 *
 * No route uses @RequirePermission yet — Phase 2b's member-management
 * endpoints are the first real consumers. Until then this class is exercised
 * only by its own unit test.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const tenant = getTenantContext(this.cls);
    if (isPublicSentinel(tenant)) {
      throw new ForbiddenException("Organization membership required.");
    }
    if (!required.every((p) => hasPermission(tenant!.role, p))) {
      throw new ForbiddenException("You do not have permission to perform this action.");
    }
    return true;
  }
}
