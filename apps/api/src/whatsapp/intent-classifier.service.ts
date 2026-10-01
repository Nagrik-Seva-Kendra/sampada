import { Injectable, Logger } from "@nestjs/common";
import { redactForModel } from "./wa-smart.js";

export type FlowIntentKind = "yes" | "no" | "unknown" | "later" | "cancel" | "change_deed" | "question" | "staff" | "unclear";
export interface FlowIntent {
  intent: FlowIntentKind;
  /** For change_deed: the document the customer now wants. */
  deedType?: "sale" | "mortgage" | "other";
  /** The customer says the file they sent is a bank sanction letter. */
  saysSanction?: boolean;
  /** For question: a short, safe answer, or null → "स्टाफ बताएगा". */
  answer?: string | null;
}

const KINDS = new Set<FlowIntentKind>(["yes", "no", "unknown", "later", "cancel", "change_deed", "question", "staff", "unclear"]);

/** Validates the model's JSON; anything malformed → null (the bot re-asks politely). */
export function mapIntent(raw: unknown): FlowIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.intent !== "string" || !KINDS.has(r.intent as FlowIntentKind)) return null;
  const out: FlowIntent = { intent: r.intent as FlowIntentKind };
  if (r.deedType === "sale" || r.deedType === "mortgage" || r.deedType === "other") out.deedType = r.deedType;
  if (out.intent === "change_deed" && !out.deedType) return { intent: "unclear" };
  if (r.saysSanction === true) out.saysSanction = true;
  if (out.intent === "question") {
    const a = typeof r.answer === "string" ? r.answer.trim().replace(/\s+/g, " ") : "";
    out.answer = a && a.length <= 300 ? a : null;
  }
  return out;
}

const SYSTEM = `You classify one WhatsApp reply from a customer of a document-writer office in Gwalior (India) that drafts property registries (विक्रय पत्र / sale deed), बंधक पत्र (mortgage deed for a bank loan) and other documents.
The bot asked the customer a question; the reply did not match the expected words. Return ONLY one JSON object:
{"intent": one of "yes","no","unknown","later","cancel","change_deed","question","staff","unclear",
 "deedType": "sale"|"mortgage"|"other"|null, "saysSanction": true|false, "answer": string|null}
Meanings:
- yes / no / unknown ("पता नहीं") / later ("बाद में भेजूंगा") answer the bot's question.
- cancel: wants to stop.
- change_deed: wants a different document than the one in progress (e.g. "bandhak banana hai" = mortgage, "registry/bechna" = sale, gift/will/agreement = other); set deedType.
- saysSanction: true if the customer says the file they sent is a bank sanction letter / loan letter.
- question: asks something; "answer" = at most 2 short, polite Hindi sentences of general process information you are certain about, never fees, amounts, dates or legal advice; otherwise null.
- staff: wants to talk to a person / call.
- unclear: none of these.
Reply text may be Hindi, Hinglish or English. Never invent facts.`;

/**
 * Asks the model what a non-matching reply means (ANTHROPIC_MODEL). Only for
 * choice questions; the text goes through redactForModel() first, so Aadhaar,
 * PAN, phone numbers and e-mails never leave. Logs status only.
 */
@Injectable()
export class IntentClassifierService {
  private readonly log = new Logger(IntentClassifierService.name);

  async classify(question: string, reply: string, context: { deedType?: string | null }): Promise<FlowIntent | null> {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const user = [
      `Document in progress: ${context.deedType ?? "not chosen yet"}`,
      `Bot's question: ${redactForModel(question).slice(0, 400)}`,
      `Customer's reply: ${redactForModel(reply)}`,
    ].join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
          max_tokens: 300,
          system: SYSTEM,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        this.log.warn(`intent model failed: HTTP ${res.status}`);
        return null;
      }
      const json: any = await res.json();
      const text = (json.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
        .replace(/```json|```/g, "")
        .trim();
      return mapIntent(JSON.parse(text));
    } catch (e: any) {
      this.log.warn(`intent model unusable: ${e?.name ?? "error"}`);
      return null;
    }
  }
}
