import { Injectable, Logger } from "@nestjs/common";
import { AI_CHAT_MODEL, AI_CHAT_SYSTEM, AI_TOOLS, cleanReply, HANDOVER_TOOLS, recentTurns, type Turn } from "./ai-chat.js";
import { redactForModel } from "./wa-smart.js";
import { maskPhone } from "./webhook-diagnostics.js";

/** What a tool hands straight to the customer (guideline questions, draft how-to, staff). */
export interface Handover {
  replies: string[];
  route: string;
}

/** The front door's own answers, offered to the assistant as tools. */
export interface AiToolbox {
  costEstimate(amount: number): Promise<string>;
  faq(question: string): Promise<string | null>;
  forwardQuestion(question: string): Promise<void>;
  startGuideline(text: string): Promise<Handover>;
  startDraft(): Promise<Handover>;
  myRequests(): Promise<string>;
  officeInfo(): Promise<string>;
  talkToStaff(reason: string): Promise<Handover>;
}

export interface AiAnswer {
  replies: string[];
  route: string;
}

const MAX_ROUNDS = 4;
const PER_HOUR = 40;

/**
 * Answers a customer like a person (ai-chat.ts): Claude with the office's
 * tools, a short memory per number, text through redactForModel() so Aadhaar,
 * PAN, phone numbers and e-mails never leave. Any failure returns null and
 * the bot's usual flow answers. Logs route and token counts only.
 */
@Injectable()
export class AiChatService {
  private readonly log = new Logger("AiChat");
  private readonly memory = new Map<string, Turn[]>();
  private readonly calls = new Map<string, number[]>();
  /** Replaced in tests. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  async reply(phone: string, text: string, box: AiToolbox, now = Date.now()): Promise<AiAnswer | null> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || !this.allowed(phone, now)) return null;

    const said = redactForModel(text);
    const history = recentTurns(this.memory.get(phone) ?? [], now);
    const messages: any[] = [...history.map((t) => ({ role: t.role, content: t.text })), { role: "user", content: said }];
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: AI_CHAT_MODEL(),
            max_tokens: 1024,
            output_config: { effort: "low" },
            system: AI_CHAT_SYSTEM,
            tools: AI_TOOLS,
            messages,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          this.log.warn(`model failed: HTTP ${res.status}`);
          return null;
        }
        const json: any = await res.json();
        tokensIn += json.usage?.input_tokens ?? 0;
        tokensOut += json.usage?.output_tokens ?? 0;
        if (json.stop_reason === "refusal") return null;

        const content: any[] = json.content ?? [];
        const uses = content.filter((b) => b.type === "tool_use");
        if (!uses.length) {
          const out = cleanReply(content.filter((b) => b.type === "text").map((b) => b.text).join(""));
          if (!out) return null;
          this.remember(phone, said, out, now);
          this.done(phone, "ai-chat", round, tokensIn, tokensOut);
          return { replies: [out], route: "ai-chat" };
        }

        messages.push({ role: "assistant", content });
        const results: any[] = [];
        for (const use of uses) {
          if (HANDOVER_TOOLS.has(use.name)) {
            const h = await this.handover(use.name, use.input ?? {}, box, text);
            this.remember(phone, said, h.replies.join("\n"), now);
            this.done(phone, h.route, round, tokensIn, tokensOut);
            return h;
          }
          results.push({ type: "tool_result", tool_use_id: use.id, content: await this.run(use.name, use.input ?? {}, box) });
        }
        messages.push({ role: "user", content: results });
      }
      this.log.warn(`no answer after ${MAX_ROUNDS} rounds`);
      return null;
    } catch (e: any) {
      this.log.warn(`model unusable: ${e?.name ?? "error"}`);
      return null;
    }
  }

  private async run(name: string, input: any, box: AiToolbox): Promise<string> {
    switch (name) {
      case "cost_estimate": {
        const amount = Number(input.amount_rupees);
        return Number.isFinite(amount) && amount > 0 ? box.costEstimate(Math.round(amount)) : "INVALID_AMOUNT";
      }
      case "faq":
        return (await box.faq(String(input.question ?? ""))) ?? "NO_ANSWER";
      case "forward_question":
        await box.forwardQuestion(String(input.question ?? ""));
        return "FORWARDED: the office will reply in this chat.";
      case "my_requests":
        return box.myRequests();
      case "office_info":
        return box.officeInfo();
      default:
        return "UNKNOWN_TOOL";
    }
  }

  private handover(name: string, input: any, box: AiToolbox, text: string): Promise<Handover> {
    if (name === "start_guideline_questions") return box.startGuideline(String(input.what_they_said || text));
    if (name === "start_draft") return box.startDraft();
    return box.talkToStaff(String(input.reason ?? "बात करना चाहते हैं"));
  }

  private remember(phone: string, said: string, answer: string, now: number) {
    const turns = recentTurns(this.memory.get(phone) ?? [], now);
    turns.push({ role: "user", text: said, at: now }, { role: "assistant", text: answer.slice(0, 1500), at: now });
    this.memory.set(phone, turns);
    if (this.memory.size > 2000) this.memory.delete(this.memory.keys().next().value as string);
  }

  /** At most PER_HOUR model replies per number per hour. */
  private allowed(phone: string, now: number): boolean {
    const recent = (this.calls.get(phone) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= PER_HOUR) return false;
    recent.push(now);
    this.calls.set(phone, recent);
    return true;
  }

  private done(phone: string, route: string, round: number, tokensIn: number, tokensOut: number) {
    this.log.log(`ai reply ${maskPhone(phone)} route=${route} rounds=${round + 1} in=${tokensIn} out=${tokensOut}`);
  }
}
