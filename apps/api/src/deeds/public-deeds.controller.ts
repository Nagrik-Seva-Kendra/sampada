import { Body, Controller, Get, NotFoundException, Param, Post, Sse, UseInterceptors } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import { DeedSelectionInput } from "@sampada/shared";
import { SampleDeedsService } from "./sample-deeds.service.js";
import { DeedLiveService } from "./deed-live.service.js";
import { PublicDeedTenantInterceptor } from "../tenant/public-deed-tenant.interceptor.js";

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
@UseInterceptors(PublicDeedTenantInterceptor)
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
  /**
   * Called by the legacy paper-form share link when the party fills in
   * seller/buyer names and property details. Replaces the matching
   * {{token}} placeholders (that staff typed into the deed's own content
   * when drafting it) with the submitted values -- see
   * SampleDeedsService.applyPartyFields for the exact semantics.
   */
  @Post(":id/party-fields")
  async applyPartyFields(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(body ?? {})) {
      if (typeof v === "string") fields[k] = v;
    }
    return this.service.applyPartyFields(id, fields);
  }

  /**
  * Called by the legacy paper-form share link's own page whenever a party
  * edits a field. Overwrites the raw snapshot of field values (property,
  * payment and party fields) used to repopulate the form the next time
  * this same link is opened -- see SampleDeedsService.saveFormState.
  */
  @Post(":id/form-state")
  async saveFormState(@Param("id") id: string, @Body() body: { formData?: unknown }) {
    return this.service.saveFormState(id, body?.formData ?? {});
  }

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
