import { ForbiddenException } from "@nestjs/common";
import type { ClsService } from "nestjs-cls";
import { TENANT_KEY, type TenantContext } from "./tenant-context.js";

/** Typed read of the request's tenant context from CLS; undefined if no guard populated it. */
export function getTenantContext(cls: ClsService): TenantContext | undefined {
  return cls.get(TENANT_KEY) as TenantContext | undefined;
}

/**
 * True when there's no real staff member in context: no tenant set at all, or
 * the synthetic { userId: "public", ... } sentinel PublicDeedTenantInterceptor
 * sets on unauthenticated share-link routes so the Prisma extension's typing is
 * satisfied. Callers must treat either case as "no permissions".
 */
export function isPublicSentinel(tenant: TenantContext | undefined): boolean {
  return !tenant || tenant.userId === "public";
}

/** The caller's full tenant context, or throws if there isn't a real one (see isPublicSentinel). */
export function requireTenantContext(cls: ClsService): TenantContext {
  const tenant = getTenantContext(cls);
  if (isPublicSentinel(tenant)) throw new ForbiddenException("Organization membership required.");
  return tenant!;
}
