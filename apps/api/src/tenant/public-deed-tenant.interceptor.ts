import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../prisma/prisma.service.js";
import { TENANT_KEY } from "./tenant-context.js";

/**
 * Party-facing (no-auth) deed routes need an org in context so the shared,
 * tenant-scoped services work. We resolve the org from the deed (or party) the
 * route is keyed on — via the UNSCOPED client — and set it in CLS: a share link
 * "adopts" the deed's organization. If nothing matches, a sentinel org is set so
 * downstream scoped reads simply return nothing (clean not-found) rather than
 * leaking across orgs or throwing.
 */
@Injectable()
export class PublicDeedTenantInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{ params?: Record<string, string> }>();
    const id = req.params?.deedId ?? req.params?.id;
    let organizationId = "__no_org__";
    if (id) {
      const deed = await this.prisma.$unscoped.deedTemplate.findUnique({
        where: { id },
        select: { organizationId: true },
      });
      if (deed?.organizationId) {
        organizationId = deed.organizationId;
      } else {
        const party = await this.prisma.$unscoped.party.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        if (party?.organizationId) organizationId = party.organizationId;
      }
    }
    this.cls.set(TENANT_KEY, {
      userId: "public",
      organizationId,
      membershipId: "public",
      role: "EMPLOYEE",
    });
    return next.handle();
  }
}
