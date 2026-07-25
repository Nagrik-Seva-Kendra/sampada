import { Prisma } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { applyTenantScope, type AnyClient } from "./tenant-scope.core.js";

export { TENANT_MODELS } from "./tenant-scope.core.js";

/**
 * Deny-by-default tenant scoping as a Prisma client extension. All the actual
 * logic lives in tenant-scope.core.ts (unit-tested without a generated client);
 * this only binds it to Prisma's $allOperations hook.
 */
export function tenantScopeExtension(cls: ClsService, getBase: () => AnyClient) {
  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations(ctx: {
          model?: string;
          operation: string;
          args: any;
          query: (args: any) => Promise<unknown>;
        }) {
          return applyTenantScope({ ...ctx, cls, getBase });
        },
      },
    },
  });
}

/**
 * For `.create()`/`.upsert()` calls on a tenant-scoped model: the extension
 * (see tenant-scope.core.ts, the `create`/`createMany`/`upsert` cases) always
 * stamps the real `organizationId` from tenant context into `data`, overwriting
 * whatever's there — so call sites never have (and must never fabricate) the
 * real value. This just satisfies the generated Prisma types, which don't know
 * about the extension's injection and otherwise demand the field up front.
 */
export function tenantCreateData<T>(data: Omit<T, "organizationId">): T {
  return data as unknown as T;
}
