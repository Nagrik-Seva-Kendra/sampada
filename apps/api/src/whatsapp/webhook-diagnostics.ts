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
