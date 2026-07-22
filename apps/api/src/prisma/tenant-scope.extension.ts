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
