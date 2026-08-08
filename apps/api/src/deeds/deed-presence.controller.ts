import { Body, Controller, Param, Post, Req, Sse, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { DeedPeer, DeedPresenceInput } from "@sampada/shared";
import { map, type Observable } from "rxjs";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { DeedPresenceService } from "./deed-presence.service.js";
import { DeedVisibleGuard } from "./deed-visible.guard.js";

type StaffRequest = Request & { user: StaffUser };

/**
 * Live cursors for staff editing the same deed. Both routes sit behind the
 * staff guard plus DeedVisibleGuard -- so a deed in another organization
 * reads as simply absent, and presence can't be used to probe for deeds you
 * can't already open.
 */
@Controller("deeds")
@UseGuards(JwtStaffGuard)
export class DeedPresenceController {
  constructor(private readonly presence: DeedPresenceService) {}

  /**
   * One tab's heartbeat: where its cursor is now, or that it's leaving.
   * Fire-and-forget from the client and sent often (on every cursor move,
   * throttled), so it stays deliberately cheap -- no writes, no revision
   * bookkeeping, just the in-memory roster.
   */
  @Post(":deedId/presence")
  @UseGuards(DeedVisibleGuard)
  publish(@Param("deedId") deedId: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const input = DeedPresenceInput.parse(body);

    if (input.leaving) {
      this.presence.leave(deedId, input.sessionId);
      return { ok: true };
    }

    this.presence.touch(deedId, {
      sessionId: input.sessionId,
      userId: req.user.id,
      name: req.user.name,
      caret: input.caret,
    });
    return { ok: true };
  }

  /** Everyone else's cursors on this deed, pushed as they move. */
  @Sse(":deedId/presence-stream")
  @UseGuards(DeedVisibleGuard)
  stream(@Param("deedId") deedId: string): Observable<{ data: DeedPeer[] }> {
    return this.presence.stream(deedId).pipe(map((peers) => ({ data: peers })));
  }
}
