/**
 * Pure helpers for WhatsApp webhook diagnostics: payload summaries, signature
 * checks and Graph API error summaries. They never return message text,
 * Aadhaar/PAN or tokens, so everything they produce is safe to log.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const graphBase = (): string => `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || "v21.0"}`;

export interface PayloadSummary {
  object: string;
  entries: number;
  messages: number;
  messageTypes: string[];
  statuses: number;
}

/** Counts only -- no message bodies, names or phone numbers. */
export function summarizePayload(body: unknown): PayloadSummary {
  const b = (body ?? {}) as any;
  const entries: any[] = Array.isArray(b.entry) ? b.entry : [];
  const messageTypes: string[] = [];
  let statuses = 0;
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value ?? {};
      for (const m of Array.isArray(value.messages) ? value.messages : []) messageTypes.push(String(m?.type ?? "unknown"));
      if (Array.isArray(value.statuses)) statuses += value.statuses.length;
    }
  }
  return {
    object: typeof b.object === "string" ? b.object : "(none)",
    entries: entries.length,
    messages: messageTypes.length,
    messageTypes,
    statuses,
  };
}

export function formatPayloadSummary(s: PayloadSummary): string {
  const types = s.messageTypes.length ? s.messageTypes.join(",") : "-";
  return `object=${s.object} entries=${s.entries} messages=${s.messages} types=${types} statuses=${s.statuses}`;
}

export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: "no_app_secret" | "no_raw_body" | "missing_header" | "mismatch" };

/** Verifies Meta's X-Hub-Signature-256 over the raw request bytes. */
export function checkSignature(
  secret: string | undefined,
  rawBody: Buffer | undefined,
  header: string | undefined,
): SignatureResult {
  if (!secret) return { ok: false, reason: "no_app_secret" };
  if (!rawBody) return { ok: false, reason: "no_raw_body" };
  if (!header?.startsWith("sha256=")) return { ok: false, reason: "missing_header" };
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

/** "919876543210" -> "******3210". */
export const maskPhone = (p: string | undefined): string => (p ? "*".repeat(Math.max(0, p.length - 4)) + p.slice(-4) : "-");

/**
 * One-line summary of a Graph API error response: HTTP status plus Meta's
 * error code/subcode/type/message. Only the parsed fields are used, so a raw
 * body can never leak into logs.
 */
export async function graphErrorSummary(res: Response): Promise<string> {
  let err: any;
  try {
    err = ((await res.json()) as any)?.error;
  } catch {
    err = undefined;
  }
  if (!err) return `http=${res.status}`;
  const parts = [`http=${res.status}`, `code=${err.code ?? "-"}`];
  if (err.error_subcode) parts.push(`subcode=${err.error_subcode}`);
  if (err.type) parts.push(`type=${err.type}`);
  if (err.message) parts.push(`message="${String(err.message).slice(0, 200)}"`);
  return parts.join(" ");
}

/** True for Prisma's unique-constraint violation (a duplicate webhook delivery). */
export const isUniqueViolation = (e: unknown): boolean => (e as { code?: string } | null)?.code === "P2002";

// ---------- what the connection check shows (this process, since start) ----------
export interface MetaErrorInfo {
  http: number | null;
  code: number | null;
  subcode: number | null;
  type: string | null;
  title: string | null;
  message: string | null;
  details: string | null;
}

/** Meta's text, safe to show and log: no tokens, no long digit runs (phone numbers / ids), bounded. */
export function cleanMetaText(v: unknown, max = 300): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v
    .replace(/(access_token|token|bearer|secret)\s*[=:]?\s*\S+/gi, "$1 [hidden]")
    .replace(/EAA[A-Za-z0-9]{10,}/g, "[hidden]")
    .replace(/\d[\d\s-]{6,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** The useful part of a Graph error body (code, error_subcode, error_user_title / _msg, details). */
export function metaErrorOf(json: any, http: number | null): MetaErrorInfo {
  const e = json?.error ?? {};
  return {
    http,
    code: typeof e.code === "number" ? e.code : null,
    subcode: typeof e.error_subcode === "number" ? e.error_subcode : null,
    type: cleanMetaText(e.type, 60) ?? null,
    title: cleanMetaText(e.error_user_title, 150) ?? null,
    message: cleanMetaText(e.error_user_msg) ?? cleanMetaText(e.message) ?? null,
    details: cleanMetaText(e.error_data?.details) ?? null,
  };
}

export interface WebhookStats {
  startedAt: string;
  posts: number;
  invalidSignature: number;
  lastPostAt: string | null;
  lastSignatureOk: boolean | null;
  lastInvalidReason: string | null;
  lastSummary: string | null;
  lastMessageAt: string | null;
  lastVerifyAt: string | null;
  lastVerifyOk: boolean | null;
}
export interface OutboundStats {
  at: string;
  ok: boolean;
  /** "reply" | "template" | "text" | "test" ... */
  kind: string;
  error: MetaErrorInfo | null;
}

const stats: { webhook: WebhookStats; outbound: OutboundStats | null } = {
  webhook: {
    startedAt: new Date().toISOString(),
    posts: 0,
    invalidSignature: 0,
    lastPostAt: null,
    lastSignatureOk: null,
    lastInvalidReason: null,
    lastSummary: null,
    lastMessageAt: null,
    lastVerifyAt: null,
    lastVerifyOk: null,
  },
  outbound: null,
};

export function recordWebhookPost(sigOk: boolean, reason: string | null, s: PayloadSummary, now = new Date()): void {
  const w = stats.webhook;
  w.posts++;
  if (!sigOk) w.invalidSignature++;
  w.lastPostAt = now.toISOString();
  w.lastSignatureOk = sigOk;
  w.lastInvalidReason = sigOk ? null : reason;
  w.lastSummary = formatPayloadSummary(s);
  if (s.messages > 0) w.lastMessageAt = now.toISOString();
}
export function recordWebhookVerify(ok: boolean, now = new Date()): void {
  stats.webhook.lastVerifyAt = now.toISOString();
  stats.webhook.lastVerifyOk = ok;
}
export function recordOutbound(kind: string, ok: boolean, error: MetaErrorInfo | null, now = new Date()): void {
  stats.outbound = { at: now.toISOString(), ok, kind, error: ok ? null : error };
}
export function connectionStats(): { webhook: WebhookStats; outbound: OutboundStats | null } {
  return { webhook: { ...stats.webhook }, outbound: stats.outbound ? { ...stats.outbound } : null };
}
