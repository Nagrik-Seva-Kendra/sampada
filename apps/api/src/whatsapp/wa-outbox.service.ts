import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { WaNotification, WaNotificationKind, WaReasonCode, WaTemplateDef } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { alertNumbers } from "./wa-alerts.js";
import { readMedia } from "./wa-media.js";
import { requestRef } from "./wa-requests.mapper.js";
import { cleanMetaText, graphBase, maskPhone, metaErrorOf, recordOutbound } from "./webhook-diagnostics.js";

/** WhatsApp's customer-service window: free-form text only within 24h of the customer's last message. */
export const WINDOW_MS = 24 * 3600 * 1000;

export interface TemplateCall {
  name: string;
  language: string;
  params: string[];
}

export interface OutboundMessage {
  organizationId: string;
  draftIntakeId: string;
  kind: WaNotificationKind;
  to: string;
  /** Sent as is inside the window (and stored as the record's body). */
  text: string;
  /** Used outside the window; without one the message stays PENDING there. */
  template?: TemplateCall | null;
  /**
   * A stored file sent as a WhatsApp document (caption = text). Documents go
   * only inside the window; outside it `template` is sent as a notice and the
   * document stays PENDING until the customer writes (flushPendingDocuments).
   */
  document?: DocumentRef | null;
}

export interface DocumentRef {
  key: string;
  fileName: string;
  mime: string;
}
/** What WaNotification.template stores: the template call and/or the document. */
type Stored = (TemplateCall & { document?: DocumentRef }) | { document: DocumentRef } | null;

type Delivery = { status: "SENT" | "PENDING"; via: "text" | "template" | "document" | null; wamid: string | null; reason: string | null };

/** Template body with its parameters filled in (what the customer sees). */
export function fillTemplate(def: Pick<WaTemplateDef, "body">, params: string[]): string {
  return def.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

/** Graph "components" for a body-only template. Parameters may not contain newlines/tabs or 4+ spaces (Meta rule). */
export function templatePayload(t: TemplateCall) {
  return {
    name: t.name,
    language: { code: t.language },
    components: [
      {
        type: "body",
        parameters: t.params.map((p) => ({ type: "text", text: p.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ") || "-" })),
      },
    ],
  };
}

/** Short Hindi reason for a failed send, from the Graph error code only (never the message). */
export function reasonFor(code: number | string | null | undefined, via: "text" | "template"): string {
  const c = Number(code);
  if (c === 131047) return "24 घंटे की विंडो बंद — टेम्पलेट ज़रूरी";
  if (c === 132001 || c === 132000 || c === 132015 || c === 132016) return "WhatsApp टेम्पलेट स्वीकृत नहीं / मौजूद नहीं";
  if (c === 131026) return "यह नंबर WhatsApp पर संदेश नहीं ले सकता";
  return `भेजा नहीं जा सका (${via}${code ? `, कोड ${code}` : ""})`;
}

/**
 * Sends office messages for WhatsApp requests: text inside the 24h window,
 * the approved template outside it, else PENDING (shown on the detail page with
 * a resend button). Every attempt is stored in WaNotification. Logs show the
 * request ref, masked number and outcome only -- never the message text.
 */
@Injectable()
export class WaOutboxService {
  private readonly log = new Logger("WhatsappOutbox");

  constructor(private readonly prisma: PrismaService) {}

  /** Called for every incoming message: opens/extends the 24h window for that number. */
  async touchContact(phone: string, at = new Date()): Promise<void> {
    await this.prisma.waContact.upsert({ where: { phone }, create: { phone, lastInboundAt: at }, update: { lastInboundAt: at } });
  }

  async inWindow(phone: string, now = new Date()): Promise<boolean> {
    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    return !!c && now.getTime() - c.lastInboundAt.getTime() < WINDOW_MS;
  }

  async send(m: OutboundMessage): Promise<WaNotification> {
    const d = await this.deliver(m.to, m.text, m.template ?? null, m.document ?? null);
    const row = await this.prisma.waNotification.create({
      data: {
        organizationId: m.organizationId,
        draftIntakeId: m.draftIntakeId,
        kind: m.kind,
        status: d.status,
        via: d.via,
        toPhone: m.to,
        body: m.text,
        template: (m.template || m.document ? { ...(m.template ?? {}), ...(m.document ? { document: m.document } : {}) } : undefined) as any,
        reason: d.reason,
        wamid: d.wamid,
        sentAt: d.status === "SENT" ? new Date() : null,
      },
    });
    this.log.log(`${m.kind} for request ${requestRef(m.draftIntakeId)} to ${maskPhone(m.to)}: ${d.status}${d.via ? ` via=${d.via}` : ""}`);
    return toNotification(row);
  }

  /** Manual resend of a PENDING message of this request (same window/template rule). */
  async resend(draftIntakeId: string, notificationId: string): Promise<WaNotification> {
    const row = await this.prisma.waNotification.findFirst({ where: { id: notificationId, draftIntakeId } });
    if (!row) throw new NotFoundException("संदेश नहीं मिला।");
    if (row.status === "SENT") return toNotification(row);
    const stored = (row.template as Stored) ?? null;
    const d = await this.deliver(row.toPhone, row.body, stored && "name" in stored ? stored : null, stored?.document ?? null);
    const updated = await this.prisma.waNotification.update({
      where: { id: row.id },
      data: { status: d.status, via: d.via, reason: d.reason, wamid: d.wamid, sentAt: d.status === "SENT" ? new Date() : null },
    });
    this.log.log(`${row.kind} resend for request ${requestRef(draftIntakeId)} to ${maskPhone(row.toPhone)}: ${d.status}`);
    return toNotification(updated);
  }

  async list(draftIntakeId: string): Promise<WaNotification[]> {
    const rows = await this.prisma.waNotification.findMany({ where: { draftIntakeId }, orderBy: { createdAt: "asc" }, take: 100 });
    return rows.map(toNotification);
  }

  /**
   * The customer just wrote (window open): deliver their PENDING documents of
   * the last 7 days. Returns the notifications that went out.
   */
  async flushPendingDocuments(phone: string): Promise<{ id: string; draftIntakeId: string }[]> {
    const rows = await this.prisma.waNotification.findMany({
      where: { toPhone: phone, status: "PENDING", kind: "DRAFT", createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      orderBy: { createdAt: "asc" },
    });
    const sent: { id: string; draftIntakeId: string }[] = [];
    for (const row of rows) {
      const n = await this.resend(row.draftIntakeId, row.id);
      if (n.status === "SENT") sent.push({ id: row.id, draftIntakeId: row.draftIntakeId });
    }
    return sent;
  }

  private async deliver(to: string, text: string, template: TemplateCall | null, document: DocumentRef | null = null): Promise<Delivery> {
    if (!process.env.WA_ACCESS_TOKEN || !process.env.WA_PHONE_NUMBER_ID) {
      return { status: "PENDING", via: null, wamid: null, reason: "WhatsApp कॉन्फ़िगर नहीं (WA_ACCESS_TOKEN)" };
    }
    if (document) return this.deliverDocument(to, text, template, document);
    let reason: string | null = null;
    if (await this.inWindow(to)) {
      const r = await this.post(to, { type: "text", text: { body: text } });
      if (r.ok) return { status: "SENT", via: "text", wamid: r.wamid, reason: null };
      reason = reasonFor(r.code, "text");
    }
    if (template) {
      const r = await this.post(to, { type: "template", template: templatePayload(template) });
      if (r.ok) return { status: "SENT", via: "template", wamid: r.wamid, reason: null };
      reason = reasonFor(r.code, "template");
    }
    return { status: "PENDING", via: null, wamid: null, reason: reason ?? "24 घंटे की विंडो बंद — टेम्पलेट ज़रूरी" };
  }

  private async deliverDocument(to: string, caption: string, notice: TemplateCall | null, doc: DocumentRef): Promise<Delivery> {
    if (await this.inWindow(to)) {
      const buf = await readMedia(doc.key).catch(() => null);
      if (!buf) return { status: "PENDING", via: null, wamid: null, reason: "PDF फ़ाइल नहीं मिली" };
      const mediaId = await this.uploadMedia(buf, doc.mime, doc.fileName);
      if (!mediaId) return { status: "PENDING", via: null, wamid: null, reason: "PDF WhatsApp पर अपलोड नहीं हो सकी" };
      const r = await this.post(to, { type: "document", document: { id: mediaId, filename: doc.fileName, caption } });
      if (r.ok) return { status: "SENT", via: "document", wamid: r.wamid, reason: null };
      return { status: "PENDING", via: null, wamid: null, reason: reasonFor(r.code, "text") };
    }
    // Window closed: documents can't go out. Send the notice template so the customer writes back.
    if (notice) {
      const r = await this.post(to, { type: "template", template: templatePayload(notice) });
      if (r.ok) return { status: "PENDING", via: null, wamid: r.wamid, reason: "ग्राहक को सूचना भेजी — जवाब आते ही PDF अपने-आप जाएगी" };
      return { status: "PENDING", via: null, wamid: null, reason: reasonFor(r.code, "template") };
    }
    return { status: "PENDING", via: null, wamid: null, reason: "24 घंटे की विंडो बंद" };
  }

  /** A PDF not tied to a request (archive copy): only inside the 24h window; never stored. */
  async deliverDocumentDirect(to: string, caption: string, buf: Buffer, fileName: string): Promise<{ status: "SENT" | "PENDING"; reason: string | null }> {
    if (!process.env.WA_ACCESS_TOKEN || !process.env.WA_PHONE_NUMBER_ID) return { status: "PENDING", reason: "WhatsApp कॉन्फ़िगर नहीं (WA_ACCESS_TOKEN)" };
    if (!(await this.inWindow(to))) return { status: "PENDING", reason: "24 घंटे की विंडो बंद — ग्राहक के दोबारा लिखने पर भेजें" };
    const mediaId = await this.uploadMedia(buf, "application/pdf", fileName);
    if (!mediaId) return { status: "PENDING", reason: "PDF WhatsApp पर अपलोड नहीं हो सकी" };
    const r = await this.post(to, { type: "document", document: { id: mediaId, filename: fileName, caption } });
    this.log.log(`direct document to ${maskPhone(to)}: ${r.ok ? "SENT" : "PENDING"}`);
    return r.ok ? { status: "SENT", reason: null } : { status: "PENDING", reason: reasonFor(r.code, "text") };
  }

  /** Graph media upload (the document to send); returns the media id or null. */
  async uploadMedia(buf: Buffer, mime: string, fileName: string): Promise<string | null> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), fileName);
    try {
      const res = await fetch(`${graphBase()}/${process.env.WA_PHONE_NUMBER_ID}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
        body: form,
      });
      const json: any = await res.json().catch(() => null);
      return res.ok ? (json?.id ?? null) : null;
    } catch {
      return null;
    }
  }

  /**
   * A message not tied to a request (owner's tasks, staff work, asking a party
   * for papers): text inside the 24h window, else the template; not recorded.
   */
  async deliverDirect(to: string, text: string, template: TemplateCall | null): Promise<{ status: "SENT" | "PENDING"; via: string | null; reason: string | null }> {
    const d = await this.deliver(to, text, template);
    this.log.log(`direct message to ${maskPhone(to)}: ${d.status}${d.via ? ` via=${d.via}` : ""}`);
    return d;
  }

  /**
   * Plain-text alert to the owner's numbers (WA_ALERT_NUMBERS) that is not about
   * one request (spam blocked, "staff से बात"). Text inside the 24h window only;
   * otherwise it is just logged as not delivered. Never carries message content.
   */
  async alertOwners(text: string): Promise<number> {
    let sent = 0;
    for (const to of alertNumbers()) {
      if (!process.env.WA_ACCESS_TOKEN || !(await this.inWindow(to))) continue;
      const r = await this.post(to, { type: "text", text: { body: text } });
      if (r.ok) sent++;
    }
    this.log.log(`owner alert: sent to ${sent} number(s)`);
    return sent;
  }

  /** One Graph /messages call; returns only ok / wamid / error code. */
  async post(to: string, message: Record<string, unknown>): Promise<{ ok: boolean; wamid: string | null; code: number | null }> {
    try {
      const res = await fetch(`${graphBase()}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, ...message }),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok) {
        recordOutbound(String(message.type ?? "message"), false, metaErrorOf(json, res.status));
        return { ok: false, wamid: null, code: json?.error?.code ?? res.status };
      }
      recordOutbound(String(message.type ?? "message"), true, null);
      return { ok: true, wamid: json?.messages?.[0]?.id ?? null, code: null };
    } catch (e: any) {
      recordOutbound(String(message.type ?? "message"), false, { http: null, code: null, subcode: null, type: null, title: null, message: cleanMetaText(e?.message) ?? "network error", details: null });
      return { ok: false, wamid: null, code: null };
    }
  }
}

/** The stored (Hindi) reason as a code the web app can show in English or Hindi. */
export function reasonCodeOf(reason: string | null): { reasonCode: WaReasonCode | null; reasonVars?: { via?: string; code?: string } } {
  if (!reason) return { reasonCode: null };
  const exact: [string, WaReasonCode][] = [
    ["WhatsApp कॉन्फ़िगर नहीं", "notConfigured"],
    ["24 घंटे की विंडो बंद — टेम्पलेट ज़रूरी", "windowClosedTemplate"],
    ["24 घंटे की विंडो बंद", "windowClosed"],
    ["WhatsApp टेम्पलेट स्वीकृत नहीं", "templateNotApproved"],
    ["यह नंबर WhatsApp पर संदेश नहीं ले सकता", "cannotReceive"],
    ["PDF फ़ाइल नहीं मिली", "pdfMissing"],
    ["PDF WhatsApp पर अपलोड", "pdfUpload"],
    ["ग्राहक को सूचना भेजी", "noticeSent"],
  ];
  const hit = exact.find(([prefix]) => reason.startsWith(prefix));
  if (hit) return { reasonCode: hit[1] };
  const m = reason.match(/^भेजा नहीं जा सका \((\w+)(?:, कोड ([^)]+))?\)$/);
  if (m) return { reasonCode: "sendFailed", reasonVars: { via: m[1], ...(m[2] ? { code: m[2] } : {}) } };
  return { reasonCode: null };
}

export function toNotification(row: {
  id: string;
  kind: string;
  status: string;
  via: string | null;
  toPhone: string;
  body: string;
  reason: string | null;
  createdAt: Date;
  sentAt: Date | null;
}): WaNotification {
  return {
    id: row.id,
    kind: row.kind as WaNotification["kind"],
    status: row.status === "SENT" ? "SENT" : "PENDING",
    via: row.via === "text" || row.via === "template" || row.via === "document" ? row.via : null,
    toMasked: maskPhone(row.toPhone),
    body: row.body,
    reason: row.reason,
    ...reasonCodeOf(row.reason),
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}
