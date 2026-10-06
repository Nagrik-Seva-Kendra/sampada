import { ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAssistantService } from "../whatsapp/owner-assistant.service.js";
import { digestDue, TaskJobsService } from "../whatsapp/task-jobs.service.js";
import { WhatsappService } from "../whatsapp/whatsapp.service.js";
import { opusSampleRate, speechConfig, speechErrorReason } from "./speech.service.js";
import { findMobile } from "./task-extractor.service.js";
import { isSmallTalk, istDate, looksLikeTask, OWNER_HELP } from "./task-rules.js";
import { TasksService } from "./tasks.service.js";

const OWNER = "919111111111";
const STAFF = "918319127664";
const PARTY = "919876543210";
const NOW = istDate(2026, 9, 1, 11); // Thu 1 Oct 2026, 11:00 IST
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  vi.stubEnv("WA_OWNER_NUMBERS", OWNER);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Tiny in-memory Task/WaContact/Membership store. */
function world() {
  const tasks: any[] = [];
  const contacts = new Map<string, any>();
  const members = [
    { role: "EMPLOYEE", user: { id: "u-rahul", fname: "Rahul", lname: "Baghel", mobile: "8319127664" } },
    { role: "EMPLOYEE", user: { id: "u-amit", fname: "Amit", lname: "Mathur", mobile: "+91 87701 67486" } },
    { role: "ADMIN", user: { id: "u-muskan", fname: "Muskan", lname: "Mishra", mobile: null } },
  ];
  const match = (r: any, w: any) =>
    Object.entries(w ?? {}).every(([k, v]: [string, any]) =>
      v && typeof v === "object" && !(v instanceof Date)
        ? "not" in v
          ? r[k] !== v.not
          : (!v.gt || (r[k] && r[k] > v.gt)) && (!v.lte || (r[k] && r[k] <= v.lte))
        : r[k] === v,
    );
  const prisma: any = {
    task: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const rows = tasks.filter((t) => match(t, where));
        if (orderBy?.number === "desc") rows.sort((a, b) => b.number - a.number);
        if (orderBy?.createdAt === "desc") rows.reverse();
        return rows[0] ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => tasks.filter((t) => match(t, where))),
      create: vi.fn(async ({ data }: any) => {
        const r = { id: `t${tasks.length + 1}`, status: "OPEN", createdAt: new Date(), doneAt: null, remindedAt: null, outreachAt: null, linkedRequestId: null, ...data };
        tasks.push(r);
        return r;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(tasks.find((t) => t.id === where.id), data)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        tasks.filter((t) => match(t, where) && (where.outreachAt ? t.outreachAt : true)).forEach((t) => Object.assign(t, data));
        return { count: 1 };
      }),
    },
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { ...create });
      }),
      updateMany: vi.fn(async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data })),
    },
    waMediaDeletion: { upsert: vi.fn(async () => ({})) },
    membership: { findMany: vi.fn(async () => members) },
    user: {
      findMany: vi.fn(async ({ where }: any) => members.map((m) => m.user).filter((u) => where.id.in.includes(u.id))),
      findFirst: vi.fn(async () => ({ id: "u-owner" })),
    },
  };
  const tasksSvc = new TasksService(prisma, {} as any);
  const outbox = { deliverDirect: vi.fn(async () => ({ status: "SENT", via: "text", reason: null })) };
  const speech = { transcribe: vi.fn(async () => ({ ok: true, text: "रमेश शर्मा का बैनामा सोमवार तक, मोबाइल 98765 43210" })) };
  const extractor = {
    extract: vi.fn(async (_t: string) => ({
      title: "रमेश शर्मा का बैनामा",
      partyName: "रमेश शर्मा",
      partyPhone: PARTY,
      workType: "sale",
      place: null,
      dueAt: istDate(2026, 9, 5, 18).toISOString(),
      note: null,
    })),
  };
  const owner = new OwnerAssistantService(prisma, tasksSvc, speech as any, extractor as any, outbox as any);
  return { tasks, contacts, prisma, outbox, speech, extractor, owner, tasksSvc, say: (t: string) => owner.handle(OWNER, { type: "text", text: t }, NOW) };
}

describe("owner routing", () => {
  it("owner's messages go to the assistant, not the customer flow; 'ग्राहक मोड' for 30 minutes, 'ओनर मोड' back", async () => {
    vi.stubEnv("WA_DEBOUNCE_MS", "0");
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "1");
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      const b = JSON.parse(init.body);
      if (b.type === "text") sent.push(b.text.body);
      return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
    }));
    const w = world();
    const intake = { hasActive: vi.fn(async () => false), handleText: vi.fn(async () => ["customer flow"]) };
    const front = { allowInbound: async () => true, isBlocked: async () => false, checkAbuse: async () => false, handle: vi.fn(async () => ({ replies: ["menu"], route: "menu" })), withoutRepeats: async (_p: string, r: string[]) => r };
    const wa = new WhatsappService({ waInboundMessage: { create: async () => ({}) } } as any, intake as any, { touchContact: async () => undefined } as any, { handleReply: async () => null, flushPending: async () => undefined } as any, front as any, w.owner, { handle: async (p: string, m: any) => (m.type === "text" ? w.owner.handleStaff(p, m.text ?? "") : null), ownerText: async () => null, ownerButton: async () => null } as any);
    const msg = (id: string, from: string, body: string) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id, from, type: "text", text: { body } }] } }] }] });

    await wa.handlePayload(msg("a", OWNER, "रमेश का बैनामा सोमवार तक"));
    expect(sent.at(-1)).toContain("काम दर्ज: रमेश शर्मा - विक्रय पत्र");
    expect(front.handle).not.toHaveBeenCalled();

    await wa.handlePayload(msg("b", OWNER, "ग्राहक मोड"));
    expect(sent.at(-1)).toContain("ग्राहक मोड 30 मिनट");
    w.contacts.get(OWNER).ownerTestUntil = new Date(Date.now() + 10 * 60_000);
    await wa.handlePayload(msg("c", OWNER, "hello"));
    expect(front.handle).toHaveBeenCalledTimes(1); // now treated like a customer
    await wa.handlePayload(msg("d", OWNER, "ओनर मोड"));
    expect(sent.at(-1)).toContain("ओनर मोड चालू");
    expect(w.contacts.get(OWNER).ownerTestUntil).toBeNull();

    await wa.handlePayload(msg("e", "919000000001", "hello")); // a customer
    expect(front.handle).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe("owner: note → confirm → task", () => {
  it("voice note: transcribed, kept 7 days, confirmed with हाँ, then asks before contacting the party", async () => {
    const w = world();
    const out = await w.owner.handle(OWNER, { type: "audio", audio: { key: "whatsapp/org-1/v1.ogg", buf: Buffer.from("OggS"), mime: "audio/ogg; codecs=opus" } }, NOW);
    expect(out[0]).toContain("🎙️ सुना:");
    expect(out[1]).toContain("काम दर्ज: रमेश शर्मा - विक्रय पत्र - ");
    expect(out[1]).toContain('"हाँ" / "बदलें" / "रद्द"');
    expect(w.prisma.waMediaDeletion.upsert.mock.calls[0][0].create.deleteAt).toEqual(new Date(NOW.getTime() + 7 * 864e5));
    expect(w.tasks).toHaveLength(0); // nothing saved before हाँ

    const saved = await w.say("हाँ");
    expect(saved[0]).toContain("काम #1 दर्ज");
    expect(w.tasks[0]).toMatchObject({ number: 1, partyPhone: PARTY, workType: "sale", source: "voice", transcript: expect.stringContaining("बैनामा"), createdById: "u-owner" });
    expect(saved[1]).toContain("कागज़ माँगना शुरू करूँ");
    expect(w.outbox.deliverDirect).not.toHaveBeenCalled(); // only after the owner says हाँ

    const go = await w.say("हाँ");
    expect(go[0]).toContain("पार्टी को संदेश भेज दिया");
    const [to, text, tpl] = w.outbox.deliverDirect.mock.calls[0] as any;
    expect(to).toBe(PARTY);
    expect(text).toContain("पुरानी रजिस्ट्री");
    expect(tpl.name).toBe("party_papers_request");
    expect(w.tasks[0].outreachAt).toBeTruthy();
    await w.owner.linkRequest(PARTY, "req-1");
    expect(w.tasks[0].linkedRequestId).toBe("req-1");
    expect(logged.join("\n")).not.toContain("रमेश");
  });

  it("बदलें / correction re-reads; रद्द saves nothing; voice off → clear message", async () => {
    const w = world();
    await w.say("रमेश का बैनामा");
    expect(await w.say("बदलें")).toEqual([expect.stringContaining("क्या बदलना है")]);
    await w.say("तारीख मंगलवार");
    expect(w.extractor.extract.mock.calls.at(-1)![0]).toContain("सुधार: तारीख मंगलवार");
    expect(await w.say("रद्द")).toEqual(["ठीक है, यह काम दर्ज नहीं किया।"]);
    expect(w.tasks).toHaveLength(0);
    w.speech.transcribe.mockResolvedValueOnce({ ok: false, reason: "disabled" } as any);
    expect(await w.owner.handle(OWNER, { type: "audio", audio: { key: "k", buf: Buffer.from(""), mime: "audio/ogg" } }, NOW)).toEqual([
      "🎙️ Voice अभी बंद है, कृपया लिख कर भेजें।",
    ]);
  });

  it("'3 हो गया', '3 कल', '3 रद्द', list", async () => {
    const w = world();
    for (const title of ["एक", "दो", "तीन"]) await w.tasksSvc.create("org-1", { title, source: "web", dueAt: istDate(2026, 9, 1, 18) });
    expect(await w.say("3 हो गया")).toEqual(["✅ काम #3 पूरा: तीन"]);
    expect(w.tasks[2].status).toBe("DONE");
    expect((await w.say("2 kal"))[0]).toContain("काम #2 की नई तारीख");
    expect(w.tasks[1].dueAt).toEqual(istDate(2026, 9, 2, 18));
    await w.say("1 रद्द");
    expect(w.tasks[0].status).toBe("CANCELLED");
    expect((await w.say("9 हो गया"))[0]).toContain("काम #9 नहीं मिला");
    expect((await w.say("नहीं"))[0]).toContain("अभी कोई काम पुष्टि के लिए नहीं है");
  });
});

describe("owner: greetings are not tasks; one reply per message", () => {
  it("greetings, ok, thanks, emoji and a word or two are small talk; real work notes are tasks", () => {
    for (const t of ["Hello", "hello!!", "Hi", "hii", "नमस्ते", "namaste ji", "Good morning sir", "ok", "OK 👍", "Thanks", "धन्यवाद", "👍", "ji", "?", "a", "राम राम"]) {
      expect([t, isSmallTalk(t)]).toEqual([t, true]);
      expect([t, looksLikeTask(t, NOW)]).toEqual([t, false]);
    }
    for (const t of ["कहाँ हो", "abc"]) expect([t, looksLikeTask(t, NOW)]).toEqual([t, false]);
    for (const t of ["रमेश का बैनामा", "Sharma ji ki registry kal", "शाम 5 बजे", "9876543210", "गुप्ता जी के यहाँ जाकर आना है आज", "bank se NOC lena"]) {
      expect([t, looksLikeTask(t, NOW)]).toEqual([t, true]);
    }
  });

  it("'Hello' with nothing pending → short help, no task prompt; real work text → task prompt", async () => {
    const w = world();
    expect(await w.say("Hello")).toEqual([OWNER_HELP]);
    expect(await w.say("ok")).toEqual([OWNER_HELP]);
    expect(await w.say("Thanks 🙏")).toEqual([OWNER_HELP]);
    expect(w.extractor.extract).not.toHaveBeenCalled();
    expect(w.contacts.get(OWNER)?.state ?? null).toBeNull();
    const out = await w.say("Sharma ji ki registry kal tak");
    expect(w.extractor.extract).toHaveBeenCalledTimes(1);
    expect(out[0]).toContain("काम दर्ज:");
    // A greeting while "ठीक?" is waiting is answered as itself, the task stays waiting.
    const hi = await w.say("hello");
    expect(hi[0]).toBe(OWNER_HELP);
    expect(hi[1]).toContain("पुष्टि के लिए बाकी");
    expect(w.extractor.extract).toHaveBeenCalledTimes(1);
    expect(await w.say("Cancel")).toEqual(["ठीक है, यह काम दर्ज नहीं किया।"]);
    expect(w.tasks).toHaveLength(0);
    // Voice saying only "hello": no task either.
    w.speech.transcribe.mockResolvedValueOnce({ ok: true, text: "हेलो" } as any);
    const v = await w.owner.handle(OWNER, { type: "audio", audio: { key: "k2", buf: Buffer.from("OggS"), mime: "audio/ogg" } }, NOW);
    expect(v).toEqual(['🎙️ सुना: "हेलो"', OWNER_HELP]);
  });

  it("cancel words: रद्द / radd / nahi / no / cancel / Cancel. all cancel straight away", async () => {
    const w = world();
    for (const c of ["रद्द", "radd karo", "nahi", "No", "Cancel.", "नहीं", "chhodo"]) {
      await w.say("रमेश का बैनामा");
      expect([c, await w.say(c)]).toEqual([c, ["ठीक है, यह काम दर्ज नहीं किया।"]]);
    }
    expect(w.tasks).toHaveLength(0);
  });

  it("burst 'Cancel' + 'Hello' (two webhooks at once): Cancel answered first, Hello is its own message", async () => {
    vi.stubEnv("WA_DEBOUNCE_MS", "0");
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "1");
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      const b = JSON.parse(init.body);
      if (b.type === "text") sent.push(b.text.body);
      return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
    }));
    const w = world();
    // A slow state read, like a real DB round-trip: without per-number ordering both messages would see "ठीक?".
    const read = w.prisma.waContact.findUnique.getMockImplementation()!;
    w.prisma.waContact.findUnique.mockImplementation(async (a: any) => {
      const row = await read(a);
      await new Promise((r) => setTimeout(r, 15));
      return row;
    });
    const front = { allowInbound: async () => true, isBlocked: async () => false, handle: vi.fn(async () => ({ replies: ["menu"], route: "menu" })), withoutRepeats: async (_p: string, r: string[]) => r };
    const wa = new WhatsappService({ waInboundMessage: { create: async () => ({}) } } as any, {} as any, { touchContact: async () => undefined } as any, {} as any, front as any, w.owner, { handle: async () => null, ownerText: async () => null, ownerButton: async () => null } as any);
    const msg = (id: string, body: string) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id, from: OWNER, type: "text", text: { body } }] } }] }] });

    await wa.handlePayload(msg("m1", "रमेश का बैनामा सोमवार तक"));
    expect(sent.at(-1)).toContain("काम दर्ज:");
    sent.length = 0;
    await Promise.all([wa.handlePayload(msg("m2", "Cancel")), wa.handlePayload(msg("m3", "Hello"))]);
    expect(sent).toEqual(["ठीक है, यह काम दर्ज नहीं किया।", OWNER_HELP]);
    expect(w.extractor.extract).toHaveBeenCalledTimes(1);
    expect(w.contacts.get(OWNER).state).toBe(Prisma.DbNull);
    expect(w.tasks).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe("staff broadcast and 'हो गया'", () => {
  it("one task + WhatsApp per staff with a mobile; their हो गया tells the owner who is left", async () => {
    const w = world();
    const out = (await w.say("सब स्टाफ को: कल 10 बजे तहसील जाना है"))[0]!;
    expect(out).toContain("2 स्टाफ को भेजा: Rahul Baghel, Amit Mathur");
    expect(out).toContain("मोबाइल नहीं (Team पेज पर भरें): Muskan Mishra");
    expect(w.tasks.map((t) => t.assigneeId)).toEqual(["u-rahul", "u-amit"]);
    expect(w.outbox.deliverDirect.mock.calls.map((c: any) => c[0])).toEqual([STAFF, "918770167486"]);

    const r = await w.owner.handleStaff(STAFF, "हो गया");
    expect(r).toEqual(["✅ धन्यवाद! काम #1 पूरा दर्ज हुआ।"]);
    const ownerMsg = (w.outbox.deliverDirect.mock.calls.at(-1) as any)[1];
    expect(ownerMsg).toContain("Rahul Baghel ने काम #1 पूरा किया");
    expect(ownerMsg).toContain("बाकी: Amit Mathur");
    expect(await w.owner.handleStaff("919000000001", "हो गया")).toBeNull(); // not staff
    expect(await w.owner.handleStaff(STAFF, "kal aaunga")).toBeNull();
  });
});

describe("morning list and reminders", () => {
  it("digest once a day after 09:00 IST; 2-hour reminder once; voice files deleted when due", async () => {
    expect(digestDue(istDate(2026, 9, 1, 8, 59), null)).toBe(false);
    expect(digestDue(istDate(2026, 9, 1, 9, 0), null)).toBe(true);
    expect(digestDue(istDate(2026, 9, 1, 15), istDate(2026, 9, 1, 9))).toBe(false);
    expect(digestDue(istDate(2026, 9, 2, 9, 5), istDate(2026, 9, 1, 9))).toBe(true);

    const w = world();
    await w.tasksSvc.create("org-1", { title: "आज का", source: "web", dueAt: istDate(2026, 9, 1, 12, 30) });
    await w.tasksSvc.create("org-1", { title: "पुराना", source: "web", dueAt: istDate(2026, 8, 25, 18) });
    let run: any = null;
    w.prisma.waJobRun = { findUnique: async () => run, upsert: async ({ create }: any) => (run = create) };
    w.prisma.waMediaDeletion.findMany = vi.fn(async () => []);
    const jobs = new TaskJobsService(w.prisma, w.tasksSvc, w.outbox as any);
    expect(await jobs.digest(istDate(2026, 9, 1, 9, 1))).toBe(true);
    const [to, text, tpl] = w.outbox.deliverDirect.mock.calls[0] as any;
    expect(to).toBe(OWNER);
    expect(text).toContain("1. आज का");
    expect(text).toContain("⏰ पुराने बाकी (1)");
    expect(tpl).toMatchObject({ name: "owner_task_digest_v2", params: ["01/10/2026", "1", "1"] });
    expect(await jobs.digest(istDate(2026, 9, 1, 9, 2))).toBe(false); // not twice

    expect(await jobs.reminders(istDate(2026, 9, 1, 10, 45))).toBe(1); // 12:30 is within 2 h
    expect(await jobs.reminders(istDate(2026, 9, 1, 10, 50))).toBe(0); // once
  });
});

describe("speech and phone helpers", () => {
  it("Opus sample rate from the header; config; 'API बंद' detection", () => {
    const head = Buffer.alloc(32);
    head.write("OpusHead", 4);
    head.writeUInt32LE(16000, 16);
    expect(opusSampleRate(head)).toBe(16000);
    expect(speechConfig("audio/ogg; codecs=opus", head)).toMatchObject({ encoding: "OGG_OPUS", sampleRateHertz: 16000, languageCode: "hi-IN", alternativeLanguageCodes: ["en-IN"] });
    expect(speechConfig("video/mp4", head)).toBeNull();
    expect(speechErrorReason(403, { error: { message: "Cloud Speech-to-Text API has not been used in project 1 before or it is disabled." } })).toEqual({ ok: false, reason: "disabled" });
    expect(speechErrorReason(400, { error: { message: "API key not valid." } })).toEqual({ ok: false, reason: "disabled" });
    expect(findMobile("call karna 98765-43210 ko")).toBe("919876543210");
    expect(findMobile("plot 45")).toBeNull();
  });
});

describe("web access", () => {
  it("employee sees only assigned and can't assign; manager sees all and assigns members only", async () => {
    const w = world();
    await w.tasksSvc.create("org-1", { title: "Rahul का", source: "web", assigneeId: "u-rahul" });
    await w.tasksSvc.create("org-1", { title: "किसी और का", source: "web", assigneeId: "u-amit" });
    w.prisma.membership.findFirst = vi.fn(async ({ where }: any) => (where.userId.startsWith("u-") ? { id: "m" } : null));
    const as = (role: string, userId: string) => new TasksService(w.prisma, { get: () => ({ userId, organizationId: "org-1", membershipId: "m", role }) } as any);
    const emp = await as("EMPLOYEE", "u-rahul").list({});
    expect(emp.data.map((t) => t.title)).toEqual(["Rahul का"]);
    expect(emp.canManage).toBe(false);
    await expect(as("EMPLOYEE", "u-rahul").updateWeb("t2", { status: "DONE" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(as("EMPLOYEE", "u-rahul").updateWeb("t1", { assigneeId: "u-amit" })).rejects.toBeInstanceOf(ForbiddenException);
    expect((await as("EMPLOYEE", "u-rahul").updateWeb("t1", { status: "DONE" })).status).toBe("DONE");
    const mine = await as("EMPLOYEE", "u-rahul").createWeb({ title: "अपना", workType: "other", assigneeId: "u-amit" });
    expect(mine.assigneeId).toBe("u-rahul"); // staff can only note tasks for themselves
    expect((await as("OWNER", "u-owner").list({})).data).toHaveLength(3);
    await expect(as("ADMIN", "u-muskan").updateWeb("t2", { assigneeId: "stranger" })).rejects.toThrow("सक्रिय सदस्य नहीं");
  });
});
