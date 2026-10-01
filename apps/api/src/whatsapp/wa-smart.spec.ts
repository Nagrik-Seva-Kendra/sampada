import { Logger } from "@nestjs/common";
import { DEFAULT_OFFICE_FEES } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Debouncer } from "./debouncer.js";
import { DraftIntakeService, smartCanonical } from "./draft-intake.service.js";
import { DRAFT_HOWTO, FrontDoorService, GIBBERISH_NOTICE, SPAM_PER_MINUTE, STAFF_REPLY } from "./front-door.service.js";
import { mapIntent } from "./intent-classifier.service.js";
import { isAbusive, isGibberish, isGreeting, MENU_TEXT, parseMenuChoice, redactForModel, registryCostText } from "./wa-smart.js";
import { WhatsappService } from "./whatsapp.service.js";

const PHONE = "919755725648";
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
  vi.useRealTimers();
});

describe("menu, greetings, gibberish, abuse", () => {
  it("menu is in Devanagari with the four options; numbers and words both work", () => {
    expect(MENU_TEXT).toContain("1. नई रजिस्ट्री / बंधक का ड्राफ्ट");
    expect(MENU_TEXT).toContain("2. रजिस्ट्री खर्च जानना / गाइडलाइन पता करना");
    expect(MENU_TEXT).toContain("3. मेरा काम कहाँ पहुँचा (अनुरोध नंबर)");
    expect(MENU_TEXT).toContain("4. स्टाफ से बात");
    expect(parseMenuChoice("2")).toBe(2);
    expect(parseMenuChoice("३")).toBe(3);
    expect(parseMenuChoice("1.")).toBe(1);
    expect(parseMenuChoice("registry ka kharcha kitna lagega")).toBe(2);
    expect(parseMenuChoice("guideline batao")).toBe(2);
    expect(parseMenuChoice("mera kaam kahan pahuncha")).toBe(3);
    expect(parseMenuChoice("staff se baat karni hai")).toBe(4);
    expect(parseMenuChoice("hello")).toBeNull();
    expect(parseMenuChoice("15")).toBeNull();
    expect(isGreeting("HELLO")).toBe(true);
    expect(isGreeting("नमस्ते")).toBe(true);
  });

  it("gibberish: keyboard mash yes; real words, Hindi, numbers, short replies no", () => {
    for (const g of ["Jdjdhd", "Dbhdhd", "sdfsdf", "Jdjdhd Dbhdhd", "xkcd qwrt"]) expect(isGibberish(g)).toBe(true);
    for (const r of ["HELLO", "hi", "ok", "hmm", "haan", "registry", "bandhak banana hai", "नमस्ते", "123456", "Shyam", "Rahul"]) expect(isGibberish(r)).toBe(false);
  });

  it("abuse is whole words only", () => {
    expect(isAbusive("tu chutiya hai")).toBe(true);
    expect(isAbusive("हरामी")).toBe(true);
    expect(isAbusive("Bhopal mcdonalds")).toBe(false);
    expect(isAbusive("कुत्तेवाला मोहल्ला")).toBe(false);
  });

  it("nothing that looks like Aadhaar/PAN/phone/e-mail reaches the model", () => {
    const out = redactForModel("mera aadhaar 2345 6789 0124 pan ABCDE1234F mob 9876543210 mail a@b.com, plot 45");
    expect(out).toBe("mera aadhaar [NUMBER] pan [ID] mob [NUMBER] mail [EMAIL] plot 45");
  });
});

describe("cost estimate text", () => {
  it("office fee slab on the higher of amount and guideline; both stamp rates without a registry", () => {
    const t = registryCostText({ amount: 4_000_000, guideline: null }, DEFAULT_OFFICE_FEES);
    expect(t).toContain("नगर निगम क्षेत्र 9.5% = ₹3,80,000");
    expect(t).toContain("पंजीयन शुल्क: पुरुष क्रेता 3% = ₹1,20,000");
    expect(t).toContain("कार्यालय शुल्क: ₹5,500 (लेखन शुल्क सहित, कुल)");
    const g = registryCostText({ amount: 4_000_000, guideline: { value: 6_000_000, sdPct: 0.095 } }, DEFAULT_OFFICE_FEES);
    expect(g).toContain("गणना ₹60,00,000 पर");
    expect(g).toContain("कार्यालय शुल्क: ₹6,500");
    expect(registryCostText({ amount: 9_000_000, guideline: null }, DEFAULT_OFFICE_FEES)).toContain("कार्यालय शुल्क: कार्यालय बताएगा");
  });
});

describe("debounce", () => {
  it("texts within the window → one run with all of them; a file flushes at once", async () => {
    vi.useFakeTimers();
    const d = new Debouncer(() => 10_000);
    const runs: string[][] = [];
    const run = async (b: { texts: string[] }) => {
      runs.push(b.texts);
    };
    void d.push(PHONE, "Jdjdhd", "A", run);
    await vi.advanceTimersByTimeAsync(3_000);
    void d.push(PHONE, "Dbhdhd", "A", run);
    void d.push("919000000001", "hi", "B", run);
    await vi.advanceTimersByTimeAsync(7_100);
    expect(runs).toEqual([["Jdjdhd", "Dbhdhd"]]); // window counted from the first text
    await vi.advanceTimersByTimeAsync(3_000);
    expect(runs).toEqual([["Jdjdhd", "Dbhdhd"], ["hi"]]);
    void d.push(PHONE, "pehla", "A", run);
    await d.flushNow(PHONE);
    expect(runs.at(-1)).toEqual(["pehla"]);
    expect(d.size).toBe(0);
  });
});

/** In-memory WaContact / DraftIntake for the front door. */
function frontWorld(requests: any[] = []) {
  const contacts = new Map<string, any>();
  const prisma: any = {
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { gibberishStreak: 0, ...create });
      }),
      update: vi.fn(async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data })),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (contacts.has(where.phone)) contacts.set(where.phone, { ...contacts.get(where.phone), ...data });
        return { count: 1 };
      }),
    },
    draftIntake: { findMany: vi.fn(async ({ where }: any) => requests.filter((r) => r.phone === where.phone && r.status === where.status)) },
    waOfficeFeeConfig: { findUnique: vi.fn(async () => null) },
  };
  const outbox = { alertOwners: vi.fn(async () => 1) };
  const front = new FrontDoorService(prisma, outbox as any, { extract: vi.fn() } as any, { lookup: vi.fn() } as any);
  const noDeed = async () => null;
  return { contacts, prisma, outbox, front, say: (t: string, now?: Date) => front.handle(PHONE, t, noDeed, now) };
}

describe("front door", () => {
  it('"HELLO" → the menu; 1/2/3/4 do their thing; menu 3 shows only this number\'s requests', async () => {
    const w = frontWorld([
      { id: "cmgaaaaaaaaxyz123", phone: PHONE, status: "SUBMITTED", workStatus: "DRAFT_READY" },
      { id: "cmgbbbbbbbbother1", phone: "919000000001", status: "SUBMITTED", workStatus: "DONE" },
    ]);
    expect((await w.say("HELLO")).replies).toEqual([MENU_TEXT]);
    expect((await w.say("1")).replies).toEqual([DRAFT_HOWTO]);
    const mine = (await w.say("3")).replies[0]!;
    expect(mine).toContain("अनुरोध XYZ123 — आपका ड्राफ्ट तैयार है");
    expect(mine).not.toContain("OTHER1");
    expect((await w.say("other1")).replies).toEqual([MENU_TEXT]); // another number's ref → nothing about it
    expect((await w.say("xyz123")).replies[0]).toContain("अनुरोध XYZ123");
    expect((await w.say("4")).replies).toEqual([STAFF_REPLY]);
    expect(w.outbox.alertOwners).toHaveBeenCalledWith(expect.stringContaining("स्टाफ से बात"));
  });

  it("menu 2: registry → amount → estimate; GDA पट्टा → flat fee; a bare 1 inside answers the cost question", async () => {
    const w = frontWorld();
    expect((await w.say("2")).replies[0]).toContain("कौन सा दस्तावेज़");
    expect((await w.say("1")).replies[0]).toContain("किस राशि पर");
    const est = (await w.say("60 लाख")).replies[0]!;
    expect(est).toContain("कार्यालय शुल्क: ₹6,500");
    expect(w.contacts.get(PHONE).state).toBeNull();
    await w.say("2");
    expect((await w.say("2")).replies[0]).toContain("GDA पट्टा — कार्यालय शुल्क: ₹10,000");
    await w.say("2");
    expect((await w.say("dan patra")).replies[0]).toContain("कार्यालय शुल्क: ₹6,000");
  });

  it("gibberish: 1st → menu, 3rd in a row → notice + 30 min silence; a real message ends it", async () => {
    const w = frontWorld();
    const t0 = new Date("2026-10-01T10:00:00Z");
    expect((await w.say("Jdjdhd", t0)).replies).toEqual([MENU_TEXT]);
    expect((await w.say("Dbhdhd", t0)).replies).toEqual([MENU_TEXT]); // (the no-repeat filter drops this one)
    expect((await w.say("sdfsdf", t0)).replies).toEqual([GIBBERISH_NOTICE]);
    const muted = await w.say("qwrtzz", new Date(t0.getTime() + 10 * 60_000));
    expect(muted).toEqual({ replies: [], route: "gibberish-muted" });
    expect((await w.say("hello", new Date(t0.getTime() + 11 * 60_000))).replies).toEqual([MENU_TEXT]);
    expect(w.contacts.get(PHONE).mutedUntil).toBeNull();
    expect((await w.say("Jdjdhd", new Date(t0.getTime() + 12 * 60_000))).replies).toEqual([MENU_TEXT]); // back to normal
  });

  it("no repeat: the same reply is not sent again within 10 minutes", async () => {
    const w = frontWorld();
    w.contacts.set(PHONE, { phone: PHONE });
    const t = Date.now();
    expect(await w.front.withoutRepeats(PHONE, [MENU_TEXT], t)).toEqual([MENU_TEXT]);
    expect(await w.front.withoutRepeats(PHONE, [MENU_TEXT], t + 60_000)).toEqual([]);
    expect(await w.front.withoutRepeats(PHONE, [MENU_TEXT, STAFF_REPLY], t + 2 * 60_000)).toEqual([STAFF_REPLY]);
    expect(await w.front.withoutRepeats(PHONE, [MENU_TEXT], t + 11 * 60_000)).toEqual([MENU_TEXT]);
  });

  it("spam: 20 messages in a minute → blocked, owner alerted, silent until unblocked; abuse blocks at once", async () => {
    const w = frontWorld();
    const t = Date.now();
    for (let i = 0; i < SPAM_PER_MINUTE - 1; i++) expect(await w.front.allowInbound(PHONE, t + i * 1000)).toBe(true);
    expect(await w.front.allowInbound(PHONE, t + 20_000)).toBe(false);
    expect(w.contacts.get(PHONE)).toMatchObject({ blockReason: "spam" });
    expect(w.outbox.alertOwners).toHaveBeenCalledWith(expect.stringContaining("********5648"));
    expect(await w.front.allowInbound(PHONE, t + 5 * 60_000)).toBe(false);
    // slow, normal use is never blocked
    for (let i = 0; i < 30; i++) expect(await w.front.allowInbound("919000000001", t + i * 5000)).toBe(true);
    expect(await w.front.checkAbuse("919000000002", "tu harami hai")).toBe(true);
    expect(w.contacts.get("919000000002")).toMatchObject({ blockReason: "abuse" });
    expect(logged.join("\n")).not.toContain("harami");
  });
});

describe("webhook: several quick texts → one answer", () => {
  it("two gibberish texts in 10 s get a single menu reply", async () => {
    vi.useFakeTimers();
    vi.stubEnv("WA_DEBOUNCE_MS", "10000");
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: any) => {
        const b = JSON.parse(init.body);
        if (b.type === "text") sent.push(b.text.body);
        return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
      }),
    );
    const w = frontWorld();
    const wa = new WhatsappService(
      { waInboundMessage: { create: vi.fn(async () => ({})) } } as any,
      { hasActive: async () => false, handleText: async () => null } as any,
      { touchContact: async () => undefined } as any,
      { handleReply: async () => null, flushPending: async () => undefined } as any,
      w.front,
    );
    const msg = (id: string, body: string) => ({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { contacts: [{ profile: { name: "A" } }], messages: [{ id, from: PHONE, type: "text", text: { body } }] } }] }],
    });
    await wa.handlePayload(msg("m1", "Jdjdhd"));
    await vi.advanceTimersByTimeAsync(2_000);
    await wa.handlePayload(msg("m2", "Dbhdhd"));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(sent).toEqual([MENU_TEXT]);
    expect(logged).toContain("text batch from ********5648 messages=2 route=gibberish replies=1");
    vi.unstubAllGlobals();
  });
});

describe("smart flow: replies that don't match the expected words", () => {
  function convo(step: string, intent: unknown, deed: unknown = { isSaleDeed: true, property: { propertyType: "house" }, buyers: [] }) {
    const cur: any = { id: "cmg1abcdefxyz123", organizationId: "org-1", phone: PHONE, step, status: "ACTIVE", data: { idDone: { buyer: true, mortgagor: true, witness1: true, witness2: true } }, deed, needsStaff: false, documentKey: "whatsapp/org-1/first.pdf" };
    const prisma = {
      draftIntake: {
        findFirst: vi.fn(async () => (cur.status === "ACTIVE" ? cur : null)),
        update: vi.fn(async ({ data }: any) => Object.assign(cur, data)),
      },
    };
    const classify = vi.fn(async () => mapIntent(intent));
    const outbox = { send: async () => ({}), alertOwners: vi.fn(async () => 1) };
    const svc = new DraftIntakeService(prisma as any, {} as any, { lookup: async () => null } as any, {} as any, outbox as any, { classify } as any);
    return { cur, classify, outbox, say: async (t: string) => (await svc.handleText({ phone: PHONE, name: "A" }, t))!.join("\n") };
  }

  it("sale → mortgage: 'yah bank ka sanction letter hai, ise girvi rakhkar loan chahiye' starts the बंधक flow and files the document as the sanction letter", async () => {
    const c = convo("CONFIRM_PROPERTY", { intent: "change_deed", deedType: "mortgage", saysSanction: true });
    // The rigid rules don't catch this wording ("loan chahiye" alone is not an answer); the model does.
    const out = await c.say("yeh to wo wala kaagaz hai jo maine pichhle hafte liya tha");
    expect(c.classify).toHaveBeenCalled();
    expect(out).toContain("बंधक पत्र बनाते हैं");
    expect(out).toContain("सैंक्शन लेटर मिल गया");
    expect(c.cur.data.deedType).toBe("mortgage");
    expect(c.cur.data.docs.sanction).toBe("whatsapp/org-1/first.pdf");
    expect(c.cur.step).toBe("M_REGISTRY");
  });

  it("the customer's own words win over the reader: a 'sale deed' that they call a sanction letter is the sanction letter", async () => {
    const c = convo("CONFIRM_PROPERTY", null);
    await c.say("yah bank ka sanction letter hai bandhak banana hai");
    expect(c.cur.data.docs.sanction).toBe("whatsapp/org-1/first.pdf");
    expect(c.cur.data.docs.registry).toBeUndefined();
  });

  it("yes in other words; a question gets an answer then the question again; staff; unclear → polite re-ask with examples", async () => {
    const yes = convo("PLOT_CORNER", { intent: "yes" });
    await yes.say("ji bilkul kone par hai");
    expect(yes.cur.data.plotCorner).toBe(true);

    const q = convo("PLOT_CORNER", { intent: "question", answer: "कॉर्नर प्लॉट वह है जो दो सड़कों के कोने पर हो।" });
    const qa = await q.say("corner plot kya hota hai?");
    expect(qa).toContain("कॉर्नर प्लॉट वह है");
    expect(qa).toContain("क्या यह कॉर्नर प्लॉट है");
    expect(q.cur.step).toBe("PLOT_CORNER");

    const s = convo("FINAL", { intent: "staff" });
    expect(await s.say("mujhe kisi se baat karni hai")).toContain("स्टाफ जल्द");
    expect(s.outbox.alertOwners).toHaveBeenCalled();

    const u = convo("CONFIRM_PROPERTY", { intent: "unclear" });
    const re = await u.say("abc def");
    expect(re).toContain("माफ़ कीजिए, समझ नहीं पाए");
    expect(re).toContain("बंधक पत्र");
    const none = convo("CONFIRM_PROPERTY", null); // model off/unavailable → same polite re-ask
    expect(await none.say("pata nahi kya")).toContain("माफ़ कीजिए");
  });

  it("canonical answers per step; a bad model reply is rejected", () => {
    expect(smartCanonical("FINAL", { intent: "no" })).toBe("बदलें");
    expect(smartCanonical("M_OWNER", { intent: "unknown" })).toBe("पता नहीं");
    expect(smartCanonical("M_SANCTION", { intent: "later" })).toBe("बाद में");
    expect(smartCanonical("CHOOSE_DEED", { intent: "change_deed", deedType: "mortgage" })).toBe("2");
    expect(mapIntent({ intent: "delete_everything" })).toBeNull();
    expect(mapIntent({ intent: "change_deed" })).toEqual({ intent: "unclear" });
    expect(mapIntent({ intent: "question", answer: "x".repeat(400) })).toEqual({ intent: "question", answer: null });
  });
});

describe("bot settings access (fees, unblock): OWNER/ADMIN only", () => {
  it("employee 403; owner saves a sorted fee table and unblocks in their own org", async () => {
    const { WaAdminService } = await import("./wa-admin.controller.js");
    const { ForbiddenException } = await import("@nestjs/common");
    const prisma: any = {
      waOfficeFeeConfig: { upsert: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
      waContact: { updateMany: vi.fn(async () => ({ count: 1 })), findMany: vi.fn(async () => []) },
    };
    const as = (role: string) => ({ get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role }) });
    const fees = { registrySlabs: [{ upTo: 7_500_000, fee: 6_500 }, { upTo: 5_000_000, fee: 5_500 }], registryAbove: null, gdaPatta: 10_000, otherDocs: 6_000 };
    await expect(new WaAdminService(prisma, as("EMPLOYEE") as any).setFees(fees)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(new WaAdminService(prisma, as("EMPLOYEE") as any).unblock(PHONE)).rejects.toBeInstanceOf(ForbiddenException);
    const saved = await new WaAdminService(prisma, as("OWNER") as any).setFees(fees);
    expect(saved.registrySlabs.map((s) => s.upTo)).toEqual([5_000_000, 7_500_000]);
    expect(await new WaAdminService(prisma, as("ADMIN") as any).getFees()).toEqual(DEFAULT_OFFICE_FEES);
    await new WaAdminService(prisma, as("OWNER") as any).unblock(PHONE);
    expect(prisma.waContact.updateMany.mock.calls[0][0].where).toEqual({ phone: PHONE, organizationId: "org-1" });
  });
});
