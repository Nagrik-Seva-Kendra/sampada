import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { tenantScopeExtension } from "./tenant-scope.extension.js";

/**
 * The injected Prisma client is TENANT-SCOPED by default: every query to a
 * tenant model is auto-filtered/stamped with the request's organizationId and
 * throws if there is none in context (deny-by-default — see tenant-scope.core).
 *
 * `$unscoped` is the one, greppable escape hatch: the raw client with no
 * scoping, for platform-admin endpoints, background jobs, and intentionally
 * public reads keyed by a specific id.
 *
 * We build the base client, then return the $extends()-wrapped (scoped) client
 * from the constructor so Nest injects the scoped one. The scoped client shares
 * the base connection; the extension re-dispatches through the base (getBase)
 * so its own findFirst calls are never re-scoped.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  /** Raw, unscoped client — the audited bypass. Grep "$unscoped" for every use. */
  readonly $unscoped!: PrismaClient;

  constructor(cls: ClsService) {
    super();
    const base = this;
    const scoped = this.$extends(tenantScopeExtension(cls, () => base));
    Object.defineProperty(scoped, "$unscoped", { value: base, enumerable: false });
    (scoped as unknown as OnModuleInit).onModuleInit = async () => {
      await base.$connect();
    };
    return scoped as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }
}
