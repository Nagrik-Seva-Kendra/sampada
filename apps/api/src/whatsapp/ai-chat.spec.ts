import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiChatFor, cleanReply, MEMORY_MS, recentTurns } from "./ai-chat.js";
import { type AiToolbox, AiChatService } from "./ai-chat.service.js";

const PHONE = "919000001111";

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("aiChatFor", () => {
  it("is off by default and needs the API key", () => {
    expect(aiChatFor(PHONE, { ANTHROPIC_API_KEY: "k" })).toBe(false);
    expect(aiChatFor(PHONE, { WA_AI_CHAT: "on" })).toBe(false);
    expect(aiChatFor(PHONE, { WA_AI_CHAT: "on", ANTHROPIC_API_KEY: "k" })).toBe(true);
  });

  it("in test mode only the listed numbers, in any format", () => {
    const env = { WA_AI_CHAT: "test", ANTHROPIC_API_KEY: "k", WA_AI_TEST_NUMBERS: "78984 75648, +91 90000 01111" };
    expect(aiChatFor(PHONE, env)).toBe(true);
    expect(aiChatFor("917898475648", env)).toBe(true);
    expect(aiChatFor("919999999999", env)).toBe(false);
  });
});

describe("memory and text", () => {
  it("keeps fresh turns only, starting with the customer", () => {
    const now = 10 * MEMORY_MS;
    const turns = [
      { role: "user" as const, text: "old", at: now - MEMORY_MS - 1 },
      { role: "assistant" as const, text: "a", at: now - 10 },
      { role: "user" as const, text: "q", at: now - 5 },
    ];
    expect(recentTurns(turns, now).map((t) => t.text)).toEqual(["q"]);
  });

  it("drops markdown headings and double asterisks", () => {
    expect(cleanReply("## नमस्ते\n**जी हाँ**\n\n\n\nठीक")).toBe("नमस्ते\n*जी हाँ*\n\nठीक");
  });
});

function box(over: Partial<AiToolbox> = {}): AiToolbox {
  return {
    costEstimate: vi.fn(async (a: number) => `खर्च ${a}`),
    faq: vi.fn(async () => null),
    forwardQuestion: vi.fn(async () => undefined),
    startGuideline: vi.fn(async () => ({ replies: ["कॉलोनी का नाम?"], route: "cost" })),
    startDraft: vi.fn(async () => ({ replies: ["कागज़ भेजें"], route: "draft-howto" })),
    myRequests: vi.fn(async () => "कोई अनुरोध नहीं"),
    officeInfo: vi.fn(async () => "10 से 6"),
    talkToStaff: vi.fn(async () => ({ replies: ["स्टाफ संपर्क करेगा"], route: "staff" })),
    ...over,
  };
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const text = (t: string) => ok({ stop_reason: "end_turn", content: [{ type: "text", text: t }], usage: { input_tokens: 10, output_tokens: 5 } });
const toolUse = (name: string, input: unknown) =>
  ok({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name, input }], usage: {} });

describe("AiChatService", () => {
  it("answers in words and remembers the turn", async () => {
    const ai = new AiChatService();
    const calls: any[] = [];
    ai.fetchImpl = vi.fn(async (_u: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return text("जी, बताइए 🙏");
    }) as never;
    expect(await ai.reply(PHONE, "namaste", box())).toEqual({ replies: ["जी, बताइए 🙏"], route: "ai-chat" });
    await ai.reply(PHONE, "registry ka kharch?", box());
    expect(calls[1].messages.map((m: any) => m.content)).toEqual(["namaste", "जी, बताइए 🙏", "registry ka kharch?"]);
    expect(calls[0].model).toBe("claude-haiku-5-5");
  });

  it("uses a tool and relays its figures", async () => {
    const ai = new AiChatService();
    const b = box();
    const replies = [toolUse("cost_estimate", { amount_rupees: 2000000 }), text("20 लाख पर खर्च 20000000 है")];
    let sent: any;
    ai.fetchImpl = vi.fn(async (_u: any, init: any) => {
      sent = JSON.parse(init.body);
      return replies.shift()!;
    }) as never;
    const a = await ai.reply(PHONE, "20 lakh ki registry", b);
    expect(b.costEstimate).toHaveBeenCalledWith(2000000);
    expect(sent.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "खर्च 2000000" });
    expect(a?.route).toBe("ai-chat");
  });

  it("hands over to staff with the bot's own reply", async () => {
    const ai = new AiChatService();
    const b = box();
    ai.fetchImpl = vi.fn(async () => toolUse("talk_to_staff", { reason: "कॉल चाहिए" })) as never;
    expect(await ai.reply(PHONE, "call karo", b)).toEqual({ replies: ["स्टाफ संपर्क करेगा"], route: "staff" });
    expect(b.talkToStaff).toHaveBeenCalledWith("कॉल चाहिए");
  });

  it("returns null on errors, refusals and without a key, so the usual flow answers", async () => {
    const ai = new AiChatService();
    ai.fetchImpl = vi.fn(async () => ({ ok: false, status: 529 }) as Response) as never;
    expect(await ai.reply(PHONE, "hi", box())).toBeNull();
    ai.fetchImpl = vi.fn(async () => ok({ stop_reason: "refusal", content: [] })) as never;
    expect(await ai.reply(PHONE, "hi", box())).toBeNull();
    delete process.env.ANTHROPIC_API_KEY;
    expect(await ai.reply(PHONE, "hi", box())).toBeNull();
  });

  it("never sends Aadhaar or phone numbers to the model", async () => {
    const ai = new AiChatService();
    let body = "";
    ai.fetchImpl = vi.fn(async (_u: any, init: any) => {
      body = init.body;
      return text("ठीक");
    }) as never;
    await ai.reply(PHONE, "mera aadhar 1234 5678 9012 hai, phone 9876543210", box());
    expect(body).not.toContain("9012");
    expect(body).not.toContain("9876543210");
  });
});
