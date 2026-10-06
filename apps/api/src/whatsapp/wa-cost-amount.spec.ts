import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontDoorService } from "./front-door.service.js";
import { GUIDE_ASK_BOUNDARY, GUIDE_ASK_CORNER, GUIDE_ASK_TYPE } from "./guideline-chat.js";
import { asksGuideline, COST_AMOUNT_ASK, COST_AMOUNT_UNCLEAR, COST_KIND_ASK, MENU_TEXT, parseMoney } from "./wa-smart.js";
import { WhatsappService } from "./whatsapp.service.js";

const PHONE = "919000005648";
const CUSTOMER_TEXT = "33,47,000/- pe hogi\nGanga vihar ward 60 ki rate k hisaab se 2770 sqft ka bata do guideline";
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
  const extractor = { extract: vi.fn(async () => ({ property: { locality: "गंगा विहार" }, buyers: [{}] })) };
  const guideline = { lookup: vi.fn(async () => ({ marketValue: 4_000_000, stamp: { sdPct: 9.5 } })) };
  const front = new FrontDoorService(
    prisma,
    { alertOwners: vi.fn(async () => 1), post: vi.fn(async () => ({ ok: false })) } as any,
    extractor as any,
    guideline as any,
    {} as any,
    { reply: vi.fn(async () => null) } as any,
    { settings: async () => DEFAULT_ATTENDANCE_SETTINGS, holidays: async () => [] } as any,
  );
  return { contacts, front, guideline, say: (t: string) => front.handle(PHONE, t, async () => null) };
}

describe("cost flow: amounts in free text", () => {
  it.each([
    ["33,47,000", 3_347_000],
    ["33,47,000/-", 3_347_000],
    ["3347000", 3_347_000],
    ["33 lakh 47 hajaar", 3_347_000],
    ["33 lakh 47 hajaar pe", 3_347_000],
    ["33 लाख 47 हज़ार", 3_347_000],
    ["33 लाख 47 हजार", 3_347_000],
    ["33.47 lakh", 3_347_000],
    ["₹33,47,000", 3_347_000],
    ["Rs. 33,47,000 ki", 3_347_000],
    ["१५ लाख", 1_500_000],
    ["1 करोड़ 20 लाख", 12_000_000],
    ["60 लाख", 6_000_000],
    ["15k", 15_000],
    [CUSTOMER_TEXT, 3_347_000],
    ["Ganga vihar ward 60, 2770 sqft, 33 lakh ki registry", 3_300_000],
  ])("%s → %d", (text, n) => {
    expect(parseMoney(text)).toBe(n);
  });

  it.each(["ward 60", "2770 sqft", "2770 वर्गफुट", "plot no 12345", "hello", "2025", "9876543210", "kitna lagega"])("%s → no amount", (text) => {
    expect(parseMoney(text)).toBeNull();
  });

  it("guideline asked in words", () => {
    expect(asksGuideline(CUSTOMER_TEXT)).toBe(true);
    expect(asksGuideline("33 lakh pe")).toBe(false);
  });
});

describe("cost flow: the 7:09 PM conversation", () => {
  it("amount + guideline ask in AMOUNT step → the office calculator's guideline (row confirmed, type and corner asked), not the document menu", async () => {
    const w = world();
    expect((await w.say("2")).replies).toEqual([COST_KIND_ASK]);
    expect((await w.say("1")).replies).toEqual([COST_AMOUNT_ASK]);
    const pick = await w.say(CUSTOMER_TEXT);
    expect(pick).toMatchObject({ route: "cost", force: true });
    expect(pick.replies[0]).toContain("1. क्र. 845 — सिंधिया नगर श्री गंगा विहार इन्क्लेव (वार्ड 60)");
    expect(pick.replies[0]).not.toContain("कौन सा दस्तावेज़");
    expect((await w.say("1")).replies).toEqual([GUIDE_ASK_TYPE]);
    expect((await w.say("1")).replies).toEqual([GUIDE_ASK_CORNER]);
    expect((await w.say("2")).replies).toEqual([GUIDE_ASK_BOUNDARY]);
    const ans = (await w.say("2")).replies.join("\n");
    expect(ans).toContain("गाइडलाइन मूल्य: ₹33,45,437");
    expect(ans).toContain("रजिस्ट्री राशि: ₹33,47,000");
    expect(w.contacts.get(PHONE).state).toBeNull();
  });

  it("no guideline row → said plainly, the amount estimate still given, and a registry PDF sent next is used", async () => {
    const w = world();
    await w.say("2");
    await w.say("1");
    const r = await w.say("33,47,000 pe, Xyzabc Puram ward 7 ka guideline");
    expect(r.replies[0]).toContain("33,47,000");
    expect(r.replies[1]).toContain("पंक्ति नहीं मिली");
    expect(r.replies[1]).toContain("PDF");
    expect(w.contacts.get(PHONE).state).toEqual({ mode: "cost", step: "AMOUNT", guideline: null, amount: 3_347_000 });
    const doc = await w.front.handleDocument(PHONE, { key: "k", buf: Buffer.from("x"), mime: "application/pdf" } as any);
    expect(doc!.replies).toHaveLength(1);
    expect(doc!.replies[0]).toContain("33,47,000");
    expect(w.contacts.get(PHONE).state).toBeNull();
  });

  it("'33 lakh 47 hajaar pe' answers the amount question", async () => {
    const w = world();
    await w.say("2");
    await w.say("1");
    const r = await w.say("33 lakh 47 hajaar pe");
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0]).toContain("33,47,000");
    expect(w.contacts.get(PHONE).state).toBeNull();
  });

  it("an amount at the document question means a registry; no amount → clear message, forced past the no-repeat filter", async () => {
    const w = world();
    await w.say("2");
    expect((await w.say("33 लाख 47 हज़ार की रजिस्ट्री")).replies[0]).toContain("33,47,000");
    await w.say("2");
    await w.say("1");
    const bad = await w.say("pata nahi abhi");
    expect(bad).toMatchObject({ replies: [COST_AMOUNT_UNCLEAR], route: "cost", force: true });
    expect(w.contacts.get(PHONE).state).toMatchObject({ mode: "cost", step: "AMOUNT" });
    // Guideline words with a locality → the guideline questions (rows listed, none picked).
    const g = await w.say("guideline bata do Ganga vihar");
    expect(g.force).toBe(true);
    expect(g.replies[0]).toContain("क्र. 845");
    expect(g.replies[0]).toContain("क्र. 399");
    expect(w.contacts.get(PHONE).state).toMatchObject({ mode: "guide", step: "PICK" });
    // "4" or a greeting still leaves the cost questions.
    expect((await w.say("hi")).replies).toEqual([MENU_TEXT]);
    expect(w.contacts.get(PHONE).state).toBeNull();
  });
});

describe("webhook: cost answers are never swallowed; silent batches say why", () => {
  function service(front: FrontDoorService, sent: string[]) {
    vi.stubEnv("WA_DEBOUNCE_MS", "0");
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: any) => {
        const b = JSON.parse(init.body);
        if (b.type === "text") sent.push(b.text.body);
        return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
      }),
    );
    let n = 0;
    const wa = new WhatsappService(
      { waInboundMessage: { create: vi.fn(async () => ({})) } } as any,
      { hasActive: async () => false, handleText: async () => null } as any,
      { touchContact: async () => undefined } as any,
      { handleReply: async () => null, flushPending: async () => undefined } as any,
      front,
      { isOwner: () => false, handleStaff: async () => null, linkRequest: async () => undefined } as any,
      { handle: async () => null, ownerText: async () => null, ownerButton: async () => null } as any,
    );
    return (body: string) =>
      wa.handlePayload({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { contacts: [{ profile: { name: "A" } }], messages: [{ id: `m${++n}`, from: PHONE, type: "text", text: { body } }] } }] }],
      });
  }

  it("the same unclear-amount message goes again; a repeated menu is suppressed and logged as such", async () => {
    const w = world();
    const sent: string[] = [];
    const say = service(w.front, sent);
    await say("2");
    await say("1");
    await say("pata nahi");
    await say("abhi pata nahi");
    expect(sent.filter((t) => t === COST_AMOUNT_UNCLEAR)).toHaveLength(2);
    await say("hello");
    await say("hello");
    expect(logged).toContain("text batch from ********5648 messages=1 route=greeting replies=0 silent=repeat-suppressed");
    await say(CUSTOMER_TEXT.replace("33,47,000", "34,00,000"));
    // From the menu (no cost question open): amount + guideline words → straight to the guideline questions.
    expect(sent.at(-1)).toContain("क्र. 845");
    await say("1");
    await say("1");
    await say("2");
    await say("2");
    expect(sent.at(-1)).toContain("ऊपर की राशि ₹54,563 पर 5.1%");
    expect(logged).toContain("guideline chat ********5648 step=- outcome=answered");
  });
});
