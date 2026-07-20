import { Body, Controller, Get, NotFoundException, Param, Post, Sse } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import { DeedSelectionInput } from "@sampada/shared";
import { SampleDeedsService } from "./sample-deeds.service.js";
import { DeedLiveService } from "./deed-live.service.js";

/**
 * The party-facing "open this deed" link: no auth, keyed by the deed's own
 * id (a random UUID, unguessable, the same trust model as a Google Docs
 * share link). Deliberately a separate controller from SampleDeedsController
 * (which sits behind JwtStaffGuard for every route) rather than a
 * special-cased exception inside it, so this is the one controller in the
 * app where "no auth" is the default and obviously so, not buried among
 * guarded routes. Always resolves to whatever staff most recently saved --
 * there is no separate "published" copy, so a correction is visible the
 * moment it's saved.
 */
@Controller("public/deeds")
export class PublicDeedsController {
  constructor(
    private readonly service: SampleDeedsService,
    private readonly live: DeedLiveService,
  ) {}

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const deed = await this.service.getPublic(id);
    if (!deed) throw new NotFoundException("Deed not found.");
    return deed;
  }

  /**
   * Called by the public share-link page whenever the party's text
   * selection changes. Fire-and-forget -- relayed live to any staff member
   * viewing the same deed via the SSE stream below. Not persisted anywhere:
   * this is transient "what are they looking at right now" state.
   */
  @Post(":id/selection")
  publishSelection(@Param("id") id: string, @Body() body: unknown) {
    const input = DeedSelectionInput.parse(body);
    const selection =
      input.start !== null && input.end !== null && input.end > input.start
        ? { start: input.start, end: input.end }
        : null;
    this.live.publish(id, selection);
    return { ok: true };
  }

  /**
   * Staff-side live feed of the party's current highlight on this deed, via
   * Server-Sent Events (a plain EventSource on the browser side -- no
   * client library needed). Unauthenticated like the rest of this
   * controller: the deed id is already the same unguessable UUID that gates
   * the read above, and a text-selection range carries no sensitive data of
   * its own.
   */
  @Sse(":id/selection-stream")
  selectionStream(@Param("id") id: string): Observable<{ data: unknown }> {
    return this.live.stream(id).pipe(map((selection) => ({ data: selection })));
  }
}
