import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontDoorService } from "./front-door.service.js";
import { CHECKLIST_RE } from "./satisfaction.js";
import { COST_AMOUNT_ASK, COST_KIND_ASK, MENU_TEXT, parseMenuChoice, parseMoney, REGISTRY_WORD } from "./wa-smart.js";
import { VOICE_NOT_HEARD, WhatsappService } from "./whatsapp.service.js";

/** The bot as customers write: educated (English), less educated (Hinglish, spelling slips), barely literate (one word, voice). */
const PHONE = "919000007777";

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function world() {
  const contacts = new Map<string, any>();
  const prisma: any = {
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { gibberishStreak: 0, ...create });
      }),
      update: vi.fn(async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    waOfficeFeeConfig: { findUnique: vi.fn(async () => null) },
  };
  const front = new FrontDoorService(
    prisma,
    { alertOwners: vi.fn(async () => 1), post: vi.fn(async () => ({ ok: false })) } as any,
    { extract: vi.fn(async () => null) } as any,
    { lookup: vi.fn(async () => null) } as any,
    {} as any,
    { reply: vi.fn(async () => null) } as any,
    { settings: async () => DEFAULT_ATTENDANCE_SETTINGS, holidays: async () => [] } as any,
  );
  return { contacts, front, say: (t: string) => front.handle(PHONE, t, async () => null) };
}

describe("menu words in every kind of writing", () => {
  it.each([
    ["registry karwani hai", 1],
    ["registri", 1],
    ["rjstri", 1],
    ["रजिस्टी", 1],
    ["रजिस्टरी", 1],
    ["makan bechna hai", 1],
    ["प्लॉट खरीदना है", 1],
    ["bainama", 1],
    ["पैसा", 2],
    ["charges", 2],
    ["kitne ka padega", 2],
    ["mera kam kab hoga", 3],
    ["काम कब होगा", 3],
    ["बात", 4],
    ["I want to speak to someone", 4],
    ["aadmi se baat karao", 4],
  ])("%s → %d", (text, n) => {
    expect(parseMenuChoice(text, true)).toBe(n);
  });

  it("registry word does not catch unrelated words", () => {
    for (const t of ["history", "ministry", "industry", "hello"]) expect(REGISTRY_WORD.test(t)).toBe(false);
  });

  it.each([
    ["bees lakh", 2_000_000],
    ["बीस लाख", 2_000_000],
    ["pachas hazar", 50_000],
    ["dedh lakh", 150_000],
    ["dhai lakh", 250_000],
    ["ek crore", 10_000_000],
    ["20,00,000", 2_000_000],
  ])("amount in words %s → %d", (text, n) => {
    expect(parseMoney(text)).toBe(n);
  });

  it.each([
    "kagaj kya kya lagenge",
    "कागज",
    "रजिस्ट्री के लिए कौन से दस्तावेज़ चाहिए",
    "documents required",
    "what papers do I need",
    "kya lana hai",
  ])("checklist asked: %s", (text) => {
    expect(CHECKLIST_RE.test(text)).toBe(true);
  });
});

describe("conversations", () => {
  it("one misspelt word is never called gibberish", async () => {
    const w = world();
    expect((await w.say("rjstri ka kharch")).replies).toEqual([COST_KIND_ASK]);
  });

  it("'registry' answers the document question inside the cost questions", async () => {
    const w = world();
    await w.say("2");
    expect((await w.say("registry")).replies).toEqual([COST_AMOUNT_ASK]);
    const r = await w.say("bees lakh");
    expect(r.replies.join("\n")).toContain("₹20,00,000");
  });

  it("a bare '20' at the amount question is 20 lakh, said so", async () => {
    const w = world();
    await w.say("2");
    await w.say("1");
    const r = await w.say("20");
    expect(r.replies[0]).toContain("₹20 लाख माना है");
    expect(r.replies.join("\n")).toContain("₹20,00,000");
  });

  it("an amount with a unit at the document question gives the estimate", async () => {
    const w = world();
    await w.say("2");
    expect((await w.say("5 लाख का")).replies.join("\n")).toContain("₹5,00,000");
  });

  it("an English sentence gets the same answers", async () => {
    const w = world();
    expect((await w.say("Hello")).replies).toEqual([MENU_TEXT]);
    expect((await w.say("What are the charges for a registry of 20 lakh")).replies.join("\n")).toContain("₹20,00,000");
  });
});

describe("customer voice notes", () => {
  async function service(transcribe: (b: Buffer) => Promise<any>) {
    vi.stubEnv("WA_DEBOUNCE_MS", "0");
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
    vi.stubEnv("WA_MEDIA_DIR", await mkdtemp(join(tmpdir(), "wa-voice-")));
    for (const k of ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) vi.stubEnv(k, "");
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: any) => {
        if (String(u).endsWith("/aud1")) return new Response(JSON.stringify({ url: "https://media.example/aud1", mime_type: "audio/ogg" }), { status: 200 });
        if (String(u).startsWith("https://media.example/")) return new Response(Buffer.from("ogg"), { status: 200 });
        const b = JSON.parse(init.body);
        if (b.type === "text") sent.push(b.text.body);
        return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
      }),
    );
    const w = world();
    const wa = new WhatsappService(
      { waInboundMessage: { create: vi.fn(async () => ({})) } } as any,
      { hasActive: async () => false, handleText: async () => null } as any,
      { touchContact: async () => undefined } as any,
      { handleReply: async () => null, flushPending: async () => undefined } as any,
      w.front,
      { isOwner: () => false, handleStaff: async () => null, linkRequest: async () => undefined } as any,
      { handle: async () => null, ownerText: async () => null, ownerButton: async () => null } as any,
      undefined,
      { transcribe: vi.fn(transcribe) } as any,
    );
    const voice = () =>
      wa.handlePayload({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { contacts: [{ profile: { name: "A" } }], messages: [{ id: "v1", from: PHONE, type: "audio", audio: { id: "aud1" } }] } }] }],
      });
    return { sent, voice };
  }

  it("heard → handled like typed text", async () => {
    const s = await service(async () => ({ ok: true, text: "रजिस्ट्री का खर्चा बीस लाख" }));
    await s.voice();
    expect(s.sent.join("\n")).toContain("₹20,00,000");
    expect(s.sent).not.toContain(VOICE_NOT_HEARD);
  });

  it("not heard → asked to speak again or write 4", async () => {
    const s = await service(async () => ({ ok: false, text: "" }));
    await s.voice();
    expect(s.sent).toEqual([VOICE_NOT_HEARD]);
  });
});
