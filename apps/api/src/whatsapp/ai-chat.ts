/**
 * The WhatsApp assistant that talks like a person (ai-chat.service.ts runs it).
 * Pure: who gets it, the instructions, the tools it may use and the short
 * per-number memory. Facts and figures come only from the tools -- the
 * office's own FAQ, fee calculator, request status -- never from the model.
 */

export type AiChatMode = "off" | "test" | "on";

/** WA_AI_CHAT=off|test|on; in "test" only WA_AI_TEST_NUMBERS (comma separated, any format) get it. */
export function aiChatFor(phone: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = (env.WA_AI_CHAT ?? "off").trim().toLowerCase() as AiChatMode;
  if (!env.ANTHROPIC_API_KEY) return false;
  if (mode === "on") return true;
  if (mode !== "test") return false;
  const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
  const me = digits(phone);
  return (env.WA_AI_TEST_NUMBERS ?? "")
    .split(",")
    .map(digits)
    .some((n) => n.length === 10 && n === me);
}

export const AI_CHAT_MODEL = (env: NodeJS.ProcessEnv = process.env) => env.WA_AI_MODEL || "claude-haiku-5-5";

/** The person the assistant hands over to. */
export const HANDOFF_NAME = "अनुज शर्मा";
export const OFFICE_PHONE = "78984 75648";

export const AI_CHAT_SYSTEM = `You are the WhatsApp assistant of Nagrik Seva Kendra (नागरिक सेवा केन्द्र, NSK), Govindpuri, Gwalior, M.P. -- an office that prepares property documents and gets them registered on the Sampada 2.0 portal: sale deed (रजिस्ट्री / विक्रय पत्र), GDA patta, mortgage deed for bank loans (बंधक पत्र / EM), reconveyance (बंधक मुक्ति), gift deed (दान पत्र), will (वसीयत), power of attorney (मुख्तारनामा), agreement (इकरारनामा), rent agreement (किरायानामा), partition (बँटवारा), release deed (हक़ त्याग), affidavit (शपथ पत्र), plus mutation (नामांतरण) help, certified copies of old registries, and registry from home by video KYC for documents that allow it.

How to talk:
- Write like a polite, helpful office person chatting on WhatsApp: warm, natural, short (1-4 short lines). No headings, no bullet lists unless you are relaying figures. An occasional 🙏 is fine; don't overuse emoji.
- Reply in the customer's language and script: Hindi (Devanagari) if they write Hindi, Hinglish (Roman Hindi) if they write Hinglish, English if English. Use "आप" / "aap".
- Use the conversation so far; don't greet again mid-conversation; ask at most one question at a time.
- If someone asks whether they are talking to a person or a bot, say honestly that you are NSK's digital assistant and that ${HANDOFF_NAME} ji / the staff can talk to them any time.

Facts and figures -- strict:
- Never invent fees, percentages, amounts, dates, timelines, document lists or legal rules. Use only what a tool returns, and copy every number exactly.
- For a registry cost question with an amount, call cost_estimate. Without an amount, ask for the amount (e.g. "20 लाख").
- For process / legal / document questions, call faq first. If it has no answer and you are not certain, call forward_question -- the office will reply in this chat -- and tell the customer so.
- For the guideline value (collector rate) of a place, call start_guideline_questions; it takes over and asks the customer step by step.
- To start a draft, call start_draft (it tells them which papers to send here).
- "my work / status / kab tak hoga" -> call my_requests.
- Office hours / address / location -> call office_info.
- If the customer wants a person or a call, is upset, complains, or the matter is sensitive (dispute, fraud, court, a death in the family, mutation / नामांतरण) -> call talk_to_staff.
- Never ask for Aadhaar/PAN numbers or OTPs in chat. Papers and photos can be sent here as images or PDF.
- Office phone: ${OFFICE_PHONE}. Don't promise anything the tools did not say.`;

export interface AiTool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): AiTool => ({
  name,
  description,
  input_schema: { type: "object", properties, required, additionalProperties: false },
});

export const AI_TOOLS: AiTool[] = [
  tool("cost_estimate", "Registry (sale deed) cost estimate for a property amount in rupees: stamp duty, registration fee, office fee.", {
    amount_rupees: { type: "number", description: "Property / registry amount in rupees, e.g. 2000000 for 20 lakh." },
  }, ["amount_rupees"]),
  tool("faq", "The office's approved answer to a process / legal / document question, or NO_ANSWER.", {
    question: { type: "string", description: "The customer's question, in their words." },
  }, ["question"]),
  tool("forward_question", "Send a question the assistant cannot answer to the office; they reply in this chat.", {
    question: { type: "string" },
  }, ["question"]),
  tool("start_guideline_questions", "Hand over to the guideline-value questions (place, ward, property type ...). Ends your turn.", {
    what_they_said: { type: "string", description: "What the customer said about the place, if anything." },
  }, ["what_they_said"]),
  tool("start_draft", "Tell the customer how to start a draft (which papers to send here). Ends your turn."),
  tool("my_requests", "Status of this customer's submitted requests."),
  tool("office_info", "Office hours, weekly off and address."),
  tool("talk_to_staff", "Alert the staff to contact this customer. Ends your turn.", {
    reason: { type: "string", description: "Short reason in Hindi, e.g. 'कॉल करना चाहते हैं'." },
  }, ["reason"]),
];

/** Tools whose result is sent to the customer as is (the turn ends there). */
export const HANDOVER_TOOLS = new Set(["start_guideline_questions", "start_draft", "talk_to_staff"]);

// ---------- short memory ----------

export interface Turn {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export const MEMORY_MS = 2 * 60 * 60 * 1000;
export const MEMORY_TURNS = 12;

/** Turns still fresh, newest last, at most MEMORY_TURNS, starting with a customer turn. */
export function recentTurns(turns: Turn[], now = Date.now()): Turn[] {
  const fresh = turns.filter((t) => now - t.at < MEMORY_MS).slice(-MEMORY_TURNS);
  while (fresh.length && fresh[0]?.role !== "user") fresh.shift();
  return fresh;
}

/** The model's final text, tidied for WhatsApp (no markdown bold/headings). */
export function cleanReply(text: string): string {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1500);
}
