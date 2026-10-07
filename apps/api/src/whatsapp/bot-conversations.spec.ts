/**
 * Whole-bot conversation checks (customer, owner, staff): the everyday words
 * -- cancel, ok / thanks, office hours, "मेरे काम", attendance in plain
 * words -- behave the same everywhere and never answer with the whole menu
 * again. Everything is mocked; no real message is sent.
 */
import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { istDate } from "../tasks/task-rules.js";
import { CLOSED_TEXT, isClose, isOfficeInfo, isThanks, MENU_NUDGE, officeInfoText, THANKS_TEXT } from "./chat-words.js";
import { FrontDoorService } from "./front-door.service.js";
import { detectDeedIntent, normDigits } from "./intake-rules.js";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { punchKindOf, StaffModeService } from "./staff-mode.service.js";
import { MENU_TEXT } from "./wa-smart.js";
import { WhatsappService } from "./whatsapp.service.js";

const P = "919000005648";
beforeEach(() => {
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  for (const l of ["log", "warn"] as const) vi.spyOn(Logger.prototype, l).mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function front() {
  const contacts = new Map<string, any>();
  const prisma: any = {
    waContact: {
      findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { gibberishStreak: 0, ...create });
      },
      update: async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data }),
      updateMany: async ({ where, data }: any) => {
        if (contacts.has(where.phone)) contacts.set(where.phone, { ...contacts.get(where.phone), ...data });
        return { count: 1 };
      },
    },
    draftIntake: { findMany: async () => [] },
    waOfficeFeeConfig: { findUnique: async () => null },
  };
  const outbox = { alertOwners: vi.fn(async () => 1), post: async () => ({ ok: false }) };
  const settings = { ...DEFAULT_ATTENDANCE_SETTINGS, startTime: "10:30", endTime: "19:00", weeklyOff: [0] };
  const f = new FrontDoorService(prisma, outbox as any, {} as any, { lookup: async () => null } as any, { create: async () => ({ number: 7 }) } as any, { reply: async () => null } as any, { settings: async () => settings, holidays: async () => [] } as any);
  // The real "deed words" reply of a number with no draft going on.
  const deedWords = (t: string) => async () => {
    const v = normDigits(t.trim());
    return /ड्राफ्ट|draft|रजिस्ट्री|registry/i.test(v) || detectDeedIntent(v) ? ["DRAFT-HOWTO"] : null;
  };
  return { f, contacts, outbox, say: (t: string) => f.handle(P, t, deedWords(t)) };
}

describe("shared words", () => {
  it.each(["Cancel", "cancel karo", "रद्द", "रद्द करो", "बंद कर दो", "stop", "बस", "rehne do", "nahi chahiye"])("%s closes", (t) => expect(isClose(t)).toBe(true));
  it.each(["ok", "Okay", "ओके", "thanks", "thank you", "धन्यवाद", "शुक्रिया", "👍", "🙏🙏", "theek hai", "bye", "ji"])("%s is thanks", (t) => expect(isThanks(t)).toBe(true));
  it.each(["office kab khulta hai", "ऑफिस कहाँ है", "address bhejo", "aapka office ka time", "location bhejo"])("%s asks office info", (t) => expect(isOfficeInfo(t)).toBe(true));
  it.each(["2", "रजिस्ट्री का खर्च", "hello", "registry kab hogi"])("%s is none of them", (t) => {
    expect(isClose(t) || isThanks(t) || isOfficeInfo(t)).toBe(false);
  });
  it("office info from the attendance settings (+ address when set)", () => {
    const t = officeInfoText({ startTime: "10:30", endTime: "19:00", weeklyOff: [0] }, "78984 75648", {});
    expect(t).toBe(
      "🏢 नागरिक सेवा केंद्र\nसमय: सुबह 10:30 से शाम 7:00 तक (रविवार बंद)\n" +
        "पता: G-11, 12, मिलेनियम प्लाज़ा, गोविंदपुरी, सिटी सेंटर, ग्वालियर (म.प्र.)\n(G-11, 12 Millenium Plaza, Govindpuri, City Centre, Gwalior, M.P.)\n" +
        "नक्शा: https://www.google.com/maps/search/?api=1&query=G-11%2C%2012%20Millenium%20Plaza%2C%20Govindpuri%2C%20City%20Centre%2C%20Gwalior%2C%20M.P.\n" +
        "फ़ोन: 78984 75648",
    );
    expect(officeInfoText({ startTime: "10:30", endTime: "19:00", weeklyOff: [] }, null, { OFFICE_ADDRESS: "सिटी सेंटर, ग्वालियर" })).toContain("पता: सिटी सेंटर, ग्वालियर");
  });
});

describe("customer", () => {
  it("'Cancel' (the 10:15 PM screenshot) and cancel inside any question → a short 'बंद कर दिया', never the menu", async () => {
    const w = front();
    expect(await w.say("Cancel")).toMatchObject({ replies: [CLOSED_TEXT], route: "closed" });
    for (const seq of [["2"], ["2", "1"], ["Ganga vihar ward 60 ki guideline 2770 sqft"], ["Ganga vihar ward 60 ki guideline 2770 sqft", "1", "1"]]) {
      const x = front();
      for (const t of seq) await x.say(t);
      expect(x.contacts.get(P).state).not.toBeNull();
      expect((await x.say("रद्द करो")).replies).toEqual([CLOSED_TEXT]);
      expect(x.contacts.get(P).state).toBeNull();
    }
  });

  it("ok / thanks / 👍 after an answer → a short thanks; office hours; नामांतरण → staff; 'guideline kya hai' → asks the locality", async () => {
    const w = front();
    await w.say("2");
    await w.say("1");
    await w.say("33 lakh");
    expect((await w.say("thanks")).replies).toEqual([THANKS_TEXT]);
    expect((await w.say("👍")).replies).toEqual([THANKS_TEXT]);
    const o = (await w.say("office kab khulta hai")).replies[0]!;
    expect(o).toContain("समय: सुबह 10:30 से शाम 7:00 तक (रविवार बंद)");
    const m = await w.say("नामांतरण करवाना है");
    expect(m.route).toBe("mutation");
    expect(w.outbox.alertOwners).toHaveBeenCalledWith("📞 WhatsApp नंबर +91 90000 05648 नामांतरण के लिए बात करना चाहते हैं।");
    const g = (await w.say("guideline kya hai")).replies[0]!;
    expect(g).toContain("कलेक्टर दर");
    expect(g).toContain("कॉलोनी / मोहल्ले का नाम");
  });

  it("the deed words still start a draft; numbers still work", async () => {
    const w = front();
    expect((await w.say("बंधक बनवाना है")).replies).toEqual(["DRAFT-HOWTO"]);
    // Other documents: said plainly that the office makes them, and the owner is told.
    const will = await w.say("वसीयत बनवानी है");
    expect(will.route).toBe("faq-other-doc");
    expect(will.replies[0]).toContain("हम वसीयत भी बनाते हैं");
    expect(w.outbox.alertOwners).toHaveBeenLastCalledWith("📞 WhatsApp नंबर +91 90000 05648 वसीयत के लिए पूछ रहे हैं।");
    expect((await w.say("2")).replies[0]).toContain("कौन सा दस्तावेज़");
    await w.say("4");
    // 11:09 PM screenshot: the owner sees the whole number once, not "********5646 (+91…)".
    expect(w.outbox.alertOwners).toHaveBeenLastCalledWith("📞 WhatsApp नंबर +91 90000 05648 स्टाफ से बात करना चाहते हैं।");
    expect((await w.say("hi")).replies).toEqual([MENU_TEXT]);
  });

  it("webhook: 'hi' twice → the menu, then one short nudge instead of silence", async () => {
    vi.stubEnv("WA_DEBOUNCE_MS", "0");
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "1");
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      const b = JSON.parse(init.body);
      if (b.type === "text") sent.push(b.text.body);
      return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
    }));
    const w = front();
    const wa = new WhatsappService({ waInboundMessage: { create: async () => ({}) } } as any, { hasActive: async () => false, handleText: async () => null } as any, { touchContact: async () => undefined } as any, { handleReply: async () => null, flushPending: async () => undefined } as any, w.f, { isOwner: () => false, handleStaff: async () => null } as any, { handle: async () => null } as any);
    let n = 0;
    const say = (body: string) => wa.handlePayload({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id: `m${++n}`, from: P, type: "text", text: { body } }] } }] }] });
    await say("hi");
    await say("hi");
    await say("hi");
    expect(sent).toEqual([MENU_TEXT, MENU_NUDGE]);
  });
});

describe("staff", () => {
  function staff() {
    const contacts = new Map<string, any>();
    const prisma: any = { waContact: { findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null, upsert: async ({ where, create, update }: any) => { const c = contacts.get(where.phone); contacts.set(where.phone, c ? { ...c, ...update } : { ...create }); } } };
    const owner: any = { staffForPhone: async () => ({ userId: "u-m", name: "Muskan Mishra", firstName: "Muskan", phone: P }), handleStaff: async () => null, tasksTextFor: vi.fn(async () => "📋 Muskan, आपके खुले काम (1): …") };
    const svc = new StaffModeService(prisma, { punch: vi.fn(), apply: vi.fn() } as any, owner, { post: async () => ({ ok: false }) } as any);
    return { contacts, owner, say: (t: string) => svc.handle(P, { type: "text", text: t }) };
  }

  it("'बाहर का काम: तहसील' asks for the location with the reason (it used to crash)", async () => {
    const w = staff();
    for (const t of ["बाहर का काम: तहसील में नामांतरण", "bahar ka kaam: tehsil", "field work: bank"]) {
      const r = await w.say(t);
      expect(r![0]).toContain("लोकेशन भेजें");
      expect(w.contacts.get(P).state).toMatchObject({ mode: "att-punch", kind: "FIELD" });
    }
    expect((await w.say("बाहर का काम"))![0]).toContain("कारण साथ लिखें");
  });

  it.each([
    ["IN", "IN"],
    ["हाज़िरी", "IN"],
    ["attendance laga do", "IN"],
    ["हाजिरी लगानी है", "IN"],
    ["office pahunch gaya", "IN"],
    ["OUT", "OUT"],
    ["ghar ja raha hu", "OUT"],
    ["जा रहा हूँ", "OUT"],
    ["कल छुट्टी: शादी", null],
  ])("%s → %s", (t, k) => expect(punchKindOf(t)).toBe(k));

  it("'मेरे काम' → their tasks; ok → 🙏; cancel while a location is awaited → closed", async () => {
    const w = staff();
    expect(await w.say("aaj kya kaam hai")).toEqual(["📋 Muskan, आपके खुले काम (1): …"]);
    expect(w.owner.tasksTextFor).toHaveBeenCalledWith("u-m", "Muskan");
    expect(await w.say("ok")).toEqual(["🙏"]);
    await w.say("IN");
    expect(await w.say("cancel")).toEqual(["ठीक है।"]);
  });
});

describe("owner", () => {
  const NOW = istDate(2026, 9, 7, 11, 0);
  function owner(assignee: string | null = null) {
    const contacts = new Map<string, any>();
    const prisma: any = {
      waContact: { findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null, upsert: async ({ where, create, update }: any) => { const c = contacts.get(where.phone); contacts.set(where.phone, c ? { ...c, ...update } : { ...create }); } },
      membership: { findMany: async () => [{ user: { id: "u-m", fname: "Muskan", lname: "Mishra", mobile: null } }, { user: { id: "u-r", fname: "Rohit", lname: "Sharma", mobile: null } }] },
    };
    const open = [
      { id: "t3", number: 3, title: "वसीयत तैयार करना", assigneeId: "u-m", dueAt: NOW },
      { id: "t5", number: 5, title: "बैंक जाना", assigneeId: "u-r", dueAt: NOW },
    ];
    const tasks: any = { openTasks: async () => open, userNames: async () => new Map([["u-m", "Muskan Mishra"], ["u-r", "Rohit Sharma"]]), create: vi.fn() };
    const extractor = { extract: vi.fn(async () => ({ title: "x", partyName: null, partyPhone: null, workType: "other", place: null, dueAt: null, note: null, assigneeName: assignee })) };
    const svc = new OwnerAssistantService(prisma, tasks, {} as any, extractor as any, {} as any, { todayReport: async () => "ATT" } as any);
    return { tasks, extractor, say: (t: string) => svc.handle("919111111111", { type: "text", text: t }, NOW) };
  }

  it("list questions → the list (one staff member's when named), never a new task", async () => {
    for (const t of ["pending kaam", "kitne kaam baki hai", "काम दिखाओ"]) {
      const w = owner();
      const r = (await w.say(t))[0]!;
      expect(r).toContain("3. वसीयत तैयार करना");
      expect(r).toContain("5. बैंक जाना");
      expect(w.tasks.create).not.toHaveBeenCalled();
    }
    const m = (await owner("Muskan Mishra").say("मुस्कान के काम"))[0]!;
    expect(m).toContain("👤 Muskan Mishra:");
    expect(m).toContain("वसीयत तैयार करना");
    expect(m).not.toContain("बैंक जाना");
    const r = (await owner().say("rohit ke kaam batao"))[0]!;
    expect(r).toContain("बैंक जाना");
    expect(r).not.toContain("वसीयत");
  });

  it("ok / thanks → 🙏; 'aaj kitne customer aaye' is a question, not staff attendance or a task", async () => {
    expect(await owner().say("thanks")).toEqual(["🙏"]);
    expect((await owner().say("aaj kitne customer aaye"))[0]).toContain("यह काम दर्ज करूँ या सवाल का जवाब चाहिए?");
  });
});

describe("staff attendance: only the live location, only near the office", () => {
  it("a picked / searched place (name or address) is refused; the live location goes to the distance check", async () => {
    const contacts = new Map<string, any>();
    const prisma: any = { waContact: { findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null, upsert: async ({ where, create, update }: any) => { const c = contacts.get(where.phone); contacts.set(where.phone, c ? { ...c, ...update } : { ...create }); } } };
    const owner: any = { staffForPhone: async () => ({ userId: "u-m", name: "Muskan Mishra", firstName: "Muskan", phone: P }), handleStaff: async () => null };
    const punch = vi.fn(async () => ({ code: "tooFar", distanceM: 2400, record: null }));
    const svc = new StaffModeService(prisma, { punch } as any, owner, { post: async () => ({ ok: false }) } as any);
    await svc.handle(P, { type: "text", text: "attendance laga do" });
    const picked = await svc.handle(P, { type: "location", location: { latitude: 26.2, longitude: 78.18, name: "Nagrik Seva Kendra", address: "City Centre, Gwalior" } });
    expect(picked![0]).toContain("चुनी हुई जगह");
    expect(punch).not.toHaveBeenCalled();
    // The live position still goes to AttendanceService.punch, which refuses IN outside the office radius.
    const live = await svc.handle(P, { type: "location", location: { latitude: 26.25, longitude: 78.2 } });
    expect(punch).toHaveBeenCalledWith("org-1", "u-m", { kind: "IN", lat: 26.25, lng: 78.2 }, "whatsapp", expect.any(Date));
    expect(live![0]).not.toContain("हाज़िर");
  });
});
