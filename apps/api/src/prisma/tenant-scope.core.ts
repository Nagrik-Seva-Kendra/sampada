// Pure tenant-scoping logic, deliberately free of any @prisma/client import so
// it can be unit-tested without a generated client. tenant-scope.extension.ts
// wraps this in Prisma.defineExtension.
import { TENANT_KEY, type TenantContext } from "../tenant/tenant-context.js";

export const TENANT_MODELS = [
  "DeedTemplate",
  "DeedTemplateRevision",
  "Party",
  "DeedParty",
  "DeedNaxa",
  "DeedCorrectionRequest",
  "DeedPropertyDetail",
] as const;
export const TENANT_MODEL_SET = new Set<string>(TENANT_MODELS);

/**
 * Models with a `deletedAt` column, auto-filtered out of read results below.
 * DeedPropertyDetail is the first model in this codebase to use a timestamp
 * soft-delete (existing models like Organization use a status-enum flip
 * instead) — a per-row delete needs a timestamp, not a tenant-wide enum.
 */
export const MODELS_WITH_SOFT_DELETE = new Set<string>(["DeedPropertyDetail"]);

/** "DeedTemplate" -> "deedTemplate" (Prisma client accessor). */
export function prop(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export interface ClsLike {
  get(key: string): unknown;
}
export type AnyClient = Record<string, any>;

export interface ScopeParams {
  model?: string;
  operation: string;
  args: any;
  query: (args: any) => Promise<unknown>;
  cls: ClsLike;
  getBase: () => AnyClient;
}

/**
 * Deny-by-default tenant scoping (see extension file for the full contract).
 * Returns the (possibly re-dispatched) query result. Throws when a tenant model
 * is touched with no organization in context, or when an update/delete target
 * is not in the caller's org.
 */
export async function applyTenantScope(p: ScopeParams): Promise<unknown> {
  const { model, operation, args, query, cls, getBase } = p;
  if (!model || !TENANT_MODEL_SET.has(model)) return query(args);

  const tenant = cls.get(TENANT_KEY) as TenantContext | undefined;
  const orgId = tenant?.organizationId;
  if (!orgId) {
    throw new Error(
      `Tenant scope violation: ${model}.${operation} attempted with no organization in context. ` +
        `Use prisma.$unscoped for platform-admin / background jobs.`,
    );
  }

  const a = args ?? {};
  const base = getBase()[prop(model)];
  const softDelete = MODELS_WITH_SOFT_DELETE.has(model);
  const readWhere = (where: any) => ({
    ...where,
    organizationId: orgId,
    ...(softDelete ? { deletedAt: null } : {}),
  });

  switch (operation) {
    case "findMany":
    case "findFirst":
    case "findFirstOrThrow":
    case "count":
    case "aggregate":
    case "groupBy":
      return query({ ...a, where: readWhere(a.where ?? {}) });

    case "updateMany":
    case "deleteMany":
      return query({ ...a, where: { ...(a.where ?? {}), organizationId: orgId } });

    case "findUnique":
      return base.findFirst({ ...a, where: readWhere(a.where ?? {}) });
    case "findUniqueOrThrow":
      return base.findFirstOrThrow({ ...a, where: readWhere(a.where ?? {}) });

    case "create":
      return query({ ...a, data: { ...(a.data ?? {}), organizationId: orgId } });
    case "createMany": {
      const rows = Array.isArray(a.data) ? a.data : [a.data];
      return query({ ...a, data: rows.map((d: any) => ({ ...d, organizationId: orgId })) });
    }

    case "update":
    case "delete": {
      const found = await base.findFirst({
        where: { ...(a.where ?? {}), organizationId: orgId },
        select: { id: true },
      });
      if (!found) {
        throw new Error(
          `Tenant scope violation: ${model}.${operation} target not found in the current organization.`,
        );
      }
      return query(a);
    }

    case "upsert":
      return query({
        ...a,
        where: { ...(a.where ?? {}) },
        create: { ...(a.create ?? {}), organizationId: orgId },
        update: { ...(a.update ?? {}) },
      });

    default:
      throw new Error(
        `Tenant scope: unhandled operation ${model}.${operation}; refusing to run unscoped.`,
      );
  }
}
