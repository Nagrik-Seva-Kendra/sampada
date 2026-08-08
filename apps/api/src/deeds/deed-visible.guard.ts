import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { SampleDeedsService } from "./sample-deeds.service.js";

/**
 * Refuses routes for a deed the caller can't already open. Reads through the
 * tenant-scoped Prisma client, so another organization's deed simply isn't
 * found.
 *
 * This has to be a guard rather than a check inside the handler because of
 * the SSE route: an @Sse handler returns an Observable, and Nest has already
 * sent the response headers by the time anything that Observable does can
 * throw -- so an in-handler check reports 200 and then quietly errors the
 * stream. Guards run first, so the caller gets an honest 404 and no stream is
 * ever opened. Must be listed after JwtStaffGuard, which is what establishes
 * the tenant context this relies on.
 */
@Injectable()
export class DeedVisibleGuard implements CanActivate {
  constructor(private readonly deeds: SampleDeedsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const deedId = req.params.deedId;
    if (typeof deedId !== "string" || !deedId) throw new NotFoundException("Deed not found.");

    const deed = await this.deeds.getOne(deedId);
    if (!deed) throw new NotFoundException("Deed not found.");
    return true;
  }
}
