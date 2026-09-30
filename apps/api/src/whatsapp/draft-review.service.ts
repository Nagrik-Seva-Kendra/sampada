import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { DRAFT_APPROVE_RE, maskIdNumbers, WA_TEMPLATES, type WaDraftForCustomer } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { alertNumbers, requestLink } from "./wa-alerts.js";
import { putMedia } from "./wa-media.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { type DraftIntakeRow, requestRef } from "./wa-requests.mapper.js";
import { isManagerRole, visibleWhere } from "./wa-requests.service.js";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DRAFT_ASK = 'कृपया ड्राफ्ट ध्यान से जाँचें। सब ठीक हो तो "SAHI HAI" (सही है) लिखें, नहीं तो जो गलती है वह लिखकर भेजें।';

/** The customer's answer to a draft: approval or a correction text. */
export function classifyDraftReply(text: string): "approved" | "correction" {
  return DRAFT_APPROVE_RE.test(text.normalize("NFC")) ? "approved" : "correction";
}

/**
 * "ग्राहक को ड्राफ्ट भेजें": the linked deed's text for the customer copy (Aadhaar/PAN
 * cut to the last 4 by the API), the PDF built from it in the browser sent as a
 * WhatsApp document, and the customer's "SAHI HAI" / correction answer.
 * Logs never carry the deed text or the customer's reply.
 */
@Injectable()
export class DraftReviewService {
  private readonly log = new Logger("WhatsappDraftReview");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly outbox: WaOutboxService,
  ) {}

  /** OWNER/ADMIN only; the request must have a linked deed and be DRAFT_READY. */
  private async sendable(id: string): Promise<{ row: DraftIntakeRow; deed: { id: string; title: string; content: string } }> {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) throw new ForbiddenException("केवल मालिक या एडमिन ग्राहक को ड्राफ्ट भेज सकते हैं।");
    const row = (await this.prisma.draftIntake.findFirst({ where: { id, ...visibleWhere(tenant) } })) as (DraftIntakeRow & { deedTemplateId?: string | null }) | null;
    if (!row) throw new NotFoundException("अनुरोध नहीं मिला।");
    if (!row.deedTemplateId) throw new BadRequestException("इस अनुरोध से कोई डीड जुड़ी नहीं है।");
    if (row.workStatus !== "DRAFT_READY") throw new BadRequestException('ड्राफ्ट तभी भेजा जा सकता है जब स्थिति "ड्राफ्ट तैयार" हो।');
    const deed = await this.prisma.deedTemplate.findFirst({
      where: { id: row.deedTemplateId, organizationId: tenant.organizationId },
      select: { id: true, title: true, content: true },
    });
    if (!deed) throw new BadRequestException("जुड़ी हुई डीड नहीं मिली।");
    return { row, deed };
  }

  async forCustomer(id: string): Promise<WaDraftForCustomer> {
    const { row, deed } = await this.sendable(id);
    return {
      title: maskIdNumbers(deed.title),
      content: maskIdNumbers(deed.content),
      fileName: `draft-${requestRef(row.id)}.pdf`,
    };
  }

  async send(id: string, pdfBase64: string): Promise<void> {
    const { row } = await this.sendable(id);
    const tenant = requireTenantContext(this.cls);
    const pdf = Buffer.from(pdfBase64, "base64");
    if (pdf.length > MAX_PDF_BYTES) throw new BadRequestException("PDF बहुत बड़ी है (10MB तक)।");
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new BadRequestException("यह PDF फ़ाइल नहीं है।");
    const ref = requestRef(row.id);
    const key = `whatsapp/${row.organizationId}/drafts/${row.id}-${Date.now()}.pdf`;
    await putMedia(key, pdf, "application/pdf");
    const n = await this.outbox.send({
      organizationId: row.organizationId,
      draftIntakeId: row.id,
      kind: "DRAFT",
      to: row.phone,
      text: `अनुरोध नंबर ${ref} का ड्राफ्ट (केवल जाँच हेतु)।\n${DRAFT_ASK}`,
      template: { name: WA_TEMPLATES.draft.name, language: WA_TEMPLATES.draft.language, params: [ref] },
      document: { key, fileName: `draft-${ref}.pdf`, mime: "application/pdf" },
    });
    const data = { ...((row.data ?? {}) as any) };
    data.draftReview = {
      notificationId: n.id,
      key,
      sentAt: n.status === "SENT" ? new Date().toISOString() : null,
      awaiting: n.status === "SENT",
    };
    await this.prisma.draftIntake.update({ where: { id: row.id }, data: { data } });
    this.log.log(`draft for request ${ref} sent by user ${tenant.userId}: ${n.status}`);
  }

  /** After the customer writes: their PENDING draft PDFs go out now that the window is open. */
  async flushPending(phone: string): Promise<void> {
    const sent = await this.outbox.flushPendingDocuments(phone);
    for (const s of sent) {
      const row = await this.prisma.draftIntake.findFirst({ where: { id: s.draftIntakeId } });
      if (!row) continue;
      const data = { ...((row.data ?? {}) as any) };
      if (data.draftReview?.notificationId !== s.id) continue;
      data.draftReview = { ...data.draftReview, awaiting: true, sentAt: new Date().toISOString() };
      await this.prisma.draftIntake.update({ where: { id: row.id }, data: { data } });
    }
  }

  /**
   * A text from a customer whose draft is waiting for their answer: "SAHI HAI" →
   * CUSTOMER_APPROVED; anything else → CORRECTION_REQUESTED, a DeedCorrectionRequest
   * on the linked deed (else the staff note), staff check, and a staff alert.
   * Null when no draft of this number is waiting (normal bot handling).
   */
  async handleReply(phone: string, text: string): Promise<string[] | null> {
    const row = (await this.prisma.draftIntake.findFirst({
      where: {
        ...(process.env.WA_DEFAULT_ORG_ID ? { organizationId: process.env.WA_DEFAULT_ORG_ID } : {}),
        phone,
        status: "SUBMITTED",
        workStatus: "DRAFT_READY",
      },
      orderBy: { updatedAt: "desc" },
    })) as (DraftIntakeRow & { deedTemplateId?: string | null }) | null;
    const data = { ...((row?.data ?? {}) as any) };
    if (!row || row.phone !== phone || !data.draftReview?.awaiting) return null;
    const ref = requestRef(row.id);
    const reply = text.trim().slice(0, 2000);
    const result = classifyDraftReply(reply);
    data.draftReview = { ...data.draftReview, awaiting: false, result, reply: { text: reply, at: new Date().toISOString() } };

    if (result === "approved") {
      await this.prisma.draftIntake.update({ where: { id: row.id }, data: { data, workStatus: "CUSTOMER_APPROVED" } });
      await this.alertStaff(row, `✅ अनुरोध ${ref}: ग्राहक ने ड्राफ्ट "सही है" बताया।`);
      this.log.log(`request ${ref}: customer approved the draft`);
      return [`धन्यवाद! अनुरोध नंबर ${ref} के ड्राफ्ट की आपकी पुष्टि दर्ज हो गई। स्टाफ आगे की प्रक्रिया के लिए संपर्क करेगा।`];
    }

    // Correction: into the deed's existing correction list when a deed is linked.
    let recorded = false;
    if (row.deedTemplateId) {
      try {
        // No tenant context on the webhook: the audited bypass, with the org set explicitly.
        await this.prisma.$unscoped.deedCorrectionRequest.create({
          data: { deedTemplateId: row.deedTemplateId, organizationId: row.organizationId, message: `WhatsApp ग्राहक (अनुरोध ${ref}): ${reply}`.slice(0, 2000) },
        });
        recorded = true;
      } catch (e: any) {
        this.log.warn(`request ${ref}: correction not added to the deed (${e?.code ?? e?.name ?? "error"}); kept as staff note`);
      }
    }
    const note = recorded ? row.staffNote : [row.staffNote, `ग्राहक का सुधार (WhatsApp): ${reply}`].filter(Boolean).join("\n").slice(0, 2000);
    await this.prisma.draftIntake.update({
      where: { id: row.id },
      data: { data, workStatus: "CORRECTION_REQUESTED", needsStaff: true, staffNote: note },
    });
    await this.alertStaff(row, `✏️ अनुरोध ${ref}: ग्राहक ने ड्राफ्ट में सुधार माँगा है।`);
    this.log.log(`request ${ref}: customer asked for a correction (${recorded ? "deed correction" : "staff note"})`);
    return [`धन्यवाद! अनुरोध नंबर ${ref} के ड्राफ्ट में आपका सुधार दर्ज हो गया। स्टाफ सुधार करके आपसे संपर्क करेगा।`];
  }

  private async alertStaff(row: DraftIntakeRow, line: string): Promise<void> {
    for (const to of alertNumbers()) {
      await this.outbox
        .send({
          organizationId: row.organizationId,
          draftIntakeId: row.id,
          kind: "ALERT",
          to,
          text: `${line}\nदेखें: ${requestLink(row.id)}`,
          template: null,
        })
        .catch(() => undefined);
    }
  }
}
