import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { WaRequestUpdateInput, WaSendDraftInput, WaWorkStatus } from "@sampada/shared";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { DraftReviewService } from "./draft-review.service.js";
import { WaRequestsService } from "./wa-requests.service.js";

/**
 * Office view of WhatsApp draft requests ("WhatsApp अनुरोध" page). Staff login
 * plus an active org membership; every query is scoped to the caller's org, and
 * for non-OWNER/ADMIN members to requests assigned to them (see visibleWhere).
 */
@Controller("whatsapp/requests")
@UseGuards(JwtStaffGuard)
export class WaRequestsController {
  constructor(
    private readonly service: WaRequestsService,
    private readonly drafts: DraftReviewService,
  ) {}

  @Get()
  list(@Query("workStatus") workStatus?: string, @Query("needsStaff") needsStaff?: string) {
    const ws = WaWorkStatus.safeParse(workStatus);
    return this.service.list({
      workStatus: ws.success ? ws.data : undefined,
      needsStaff: needsStaff === "true" ? true : needsStaff === "false" ? false : undefined,
    });
  }

  /** Sidebar: badge count + whether to show the item. Declared before ":id". */
  @Get("summary")
  summary() {
    return this.service.summary();
  }

  @Get("assignees")
  assignees() {
    return this.service.assignees();
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  /** OWNER/ADMIN only: decrypted Aadhaar/PAN. Never cached. */
  @Post(":id/reveal")
  async reveal(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    res.set("Cache-Control", "no-store");
    return this.service.reveal(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.service.update(id, WaRequestUpdateInput.parse(body));
  }

  /** OWNER/ADMIN: the linked deed's text for the customer copy (Aadhaar/PAN only last 4). Never cached. */
  @Get(":id/draft-for-customer")
  async draftForCustomer(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    res.set("Cache-Control", "no-store");
    return this.drafts.forCustomer(id);
  }

  /** OWNER/ADMIN: send the customer-copy PDF (built in the browser from draft-for-customer) on WhatsApp. */
  @Post(":id/send-draft")
  async sendDraft(@Param("id") id: string, @Body() body: unknown) {
    await this.drafts.send(id, WaSendDraftInput.parse(body).pdfBase64);
    return this.service.detail(id);
  }

  /** Resend a message that is still PENDING ("ग्राहक को संदेश बाकी"). */
  @Post(":id/notifications/:nid/resend")
  resend(@Param("id") id: string, @Param("nid") nid: string) {
    return this.service.resendNotification(id, nid);
  }

  /** One ID-card photo (?party=buyer|mortgagor|witness1|witness2&kind=aadhaarFront|aadhaarBack|pan|passportPhoto), inline only. */
  @Get(":id/id-photo")
  async idPhoto(
    @Param("id") id: string,
    @Query("party") party: string | undefined,
    @Query("kind") kind: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.idPhoto(id, String(party ?? ""), String(kind ?? ""));
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": "inline; filename=" + JSON.stringify(f.fileName),
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(f.data);
  }

  /** Original file the customer sent (?i=0 registry, 1.. extras). ?view=1 previews inline. */
  @Get(":id/document")
  async document(
    @Param("id") id: string,
    @Query("i") i: string | undefined,
    @Query("view") view: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.document(id, i === undefined ? 0 : Number(i));
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": (view ? "inline" : "attachment") + "; filename=" + JSON.stringify(f.fileName),
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(f.data);
  }
}
