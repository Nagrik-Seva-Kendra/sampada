/**
 * A PDF / photo the owner sends with a task on WhatsApp. All mocked: the model
 * calls are stubbed, no file storage or WhatsApp message is real.
 */
import { Logger, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAssistantService } from "../whatsapp/owner-assistant.service.js";
import { WhatsappService } from "../whatsapp/whatsapp.service.js";
import { applyFill, fileFill, istDate } from "./task-rules.js";
import { TasksService } from "./tasks.service.js";

vi.mock("../whatsapp/wa-media.js", () => ({
  readMedia: vi.fn(async (key: string) => Buffer.from(`bytes of ${key}`)),
  deleteMedia: vi.fn(async () => undefined),
  putMedia: vi.fn(async () => undefined),
}));

const OWNER = "919111111111";
const NOW = istDate(2026, 9, 6, 21, 30);
const WILL = {
  isSaleDeed: false,
  documentType: "वसीयतनामा",
  sellers: [{ name: "रमेश चंद्र शर्मा", relation: null }],
  buyers: [{ name: "सुनीता शर्मा", relation: null }],
  property: { locality: "गंगा विहार", village: null, tehsil: "ग्वालियर", district: "ग्वालियर", khasraOrPlotNo: "प्लॉट 12" },
};
const FILE = { key: "whatsapp/org-1/media1.pdf", buf: Buffer.from("%PDF"), mime: "application/pdf", fileName: "will-draft.pdf" };

beforeEach(() => {
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function world(opts: { recent?: any; extractNote?: any } = {}) {
  const contacts = new Map<string, any>();
  const rows: any[] = [];
  const prisma: any = {
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { ...create });
      }),
    },
    membership: { findMany: vi.fn(async () => []) },
    user: { findFirst: vi.fn(async () => ({ id: "u-owner" })) },
    task: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.number) return rows.find((r) => r.number === where.number) ?? null;
        if (where.createdAt) return opts.recent ?? null;
        return rows.find((r) => r.id === where.id) ?? null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? opts.recent),
      update: vi.fn(async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id) ?? opts.recent;
        return Object.assign(r, data);
      }),
      create: vi.fn(async ({ data }: any) => {
        const r = { id: `t${rows.length + 1}`, createdAt: NOW, ...data };
        rows.push(r);
        return r;
      }),
    },
  };
  if (opts.recent) rows.push(opts.recent);
  const tasks = new TasksService(prisma, { get: () => ({ userId: "u-owner", organizationId: "org-1", role: "OWNER" }) } as any);
  const extractor = { extract: vi.fn(async (text: string) => opts.extractNote ?? { title: "वसीयत", partyName: null, partyPhone: null, workType: "other", place: null, dueAt: istDate(2026, 9, 7, 18).toISOString(), note: null, transcriptSeen: text }) };
  const deeds = { extract: vi.fn(async () => WILL) };
  const owner = new OwnerAssistantService(prisma, tasks, {} as any, extractor as any, {} as any, undefined, deeds as any);
  return { contacts, rows, prisma, deeds, extractor, owner, file: (caption = "", now = NOW) => owner.handleFile(OWNER, FILE, caption, now), say: (t: string, now = NOW) => owner.handle(OWNER, { type: "text", text: t }, now) };
}

describe("what a file adds to a task", () => {
  it("a will: type, executant as party, place, both sides in the note; the owner's words win", () => {
    const f = fileFill(WILL)!;
    expect(f).toEqual({
      workType: "will",
      partyName: "रमेश चंद्र शर्मा",
      place: "प्लॉट 12, गंगा विहार, ग्वालियर, ग्वालियर",
      noteLine: "फ़ाइल से: वसीयतकर्ता: रमेश चंद्र शर्मा; लाभार्थी: सुनीता शर्मा",
    });
    const d = applyFill({ title: "कल एक वसीयत होनी है मुस्कान मिश्रा को असाइन कर दो", partyName: null, place: null, workType: "other" as const, note: null }, f);
    expect(d).toMatchObject({ title: "रमेश चंद्र शर्मा — वसीयत", workType: "will", partyName: "रमेश चंद्र शर्मा", place: "प्लॉट 12, गंगा विहार, ग्वालियर, ग्वालियर" });
    const kept = applyFill({ title: "रमेश की रजिस्ट्री", partyName: "रमेश", place: "सिटी सेंटर", workType: "sale" as const, note: "जल्दी" }, f);
    expect(kept).toMatchObject({ title: "रमेश की रजिस्ट्री", partyName: "रमेश", place: "सिटी सेंटर", workType: "sale" });
    expect(kept.note).toBe("जल्दी\nफ़ाइल से: वसीयतकर्ता: रमेश चंद्र शर्मा; लाभार्थी: सुनीता शर्मा");
    expect(fileFill(null)).toBeNull();
    expect(fileFill({ sellers: [], buyers: [], property: null })).toBeNull();
  });
});

describe("owner sends a file", () => {
  it("note first, then the PDF (task waiting for हाँ) → filled from the PDF; हाँ → saved with the file", async () => {
    const w = world();
    await w.say("कल एक वसीयत होनी है");
    const r = await w.file();
    expect(r[0]).toBe("📎 फ़ाइल: will-draft.pdf — पढ़ा: वसीयत · रमेश चंद्र शर्मा · प्लॉट 12, गंगा विहार, ग्वालियर, ग्वालियर");
    expect(r[1]).toContain("काम दर्ज: रमेश चंद्र शर्मा - वसीयत - बुध, 7 अक्टू");
    const done = await w.say("हाँ");
    expect(done[0]).toContain("📎 फ़ाइल साथ रखी गई।");
    expect(w.rows[0]).toMatchObject({ workType: "will", partyName: "रमेश चंद्र शर्मा", documentKey: FILE.key, documentName: "will-draft.pdf", documentMime: "application/pdf" });
  });

  it("PDF with a caption → a new task from the caption, with the file", async () => {
    const w = world();
    const r = await w.file("कल वसीयत, मुस्कान को दे दो");
    expect(w.extractor.extract.mock.calls[0]![0]).toBe("कल वसीयत, मुस्कान को दे दो");
    expect(r.at(-1)).toContain("रमेश चंद्र शर्मा - वसीयत");
    expect(w.contacts.get(OWNER).state.file.doc.key).toBe(FILE.key);
  });

  it("PDF right after a saved task (10 min) → kept with it, empty fields filled", async () => {
    const recent = { id: "t9", number: 9, title: "कल एक वसीयत होनी है मुस्कान मिश्रा को असाइन कर दो", partyName: null, place: null, workType: "other", note: null, documentKey: null, createdAt: NOW };
    const w = world({ recent });
    const r = await w.file();
    expect(r[0]).toContain('📎 फ़ाइल काम #9 से जोड़ दी (ऐप में "मेरे काम" पर खुलेगी)।');
    expect(r[0]).toContain("काम: रमेश चंद्र शर्मा — वसीयत · पार्टी: रमेश चंद्र शर्मा · जगह: प्लॉट 12, गंगा विहार");
    expect(recent).toMatchObject({ documentKey: FILE.key, workType: "will", partyName: "रमेश चंद्र शर्मा" });
  });

  it("no task around → asks which; a number attaches, a note makes a new task, रद्द deletes the file", async () => {
    const w = world();
    w.rows.push({ id: "t3", number: 3, title: "कागज़", partyName: null, place: null, workType: "other", note: null, documentKey: null, createdAt: NOW });
    const ask = await w.file();
    expect(ask[1]).toContain("यह फ़ाइल किस काम की है?");
    expect((await w.say("3"))[0]).toContain("📎 फ़ाइल काम #3 से जोड़ दी");
    expect(w.rows[0].documentKey).toBe(FILE.key);

    const w2 = world();
    await w2.file();
    const r = await w2.say("कल वसीयत होनी है");
    expect(r[0]).toContain("📎 फ़ाइल: will-draft.pdf");
    expect(w2.contacts.get(OWNER).state.mode).toBe("task-confirm");

    const w3 = world();
    await w3.file();
    const { deleteMedia } = await import("../whatsapp/wa-media.js");
    expect(await w3.say("रद्द")).toEqual(["ठीक है, फ़ाइल हटा दी।"]);
    expect(deleteMedia).toHaveBeenCalledWith(FILE.key);
  });

  it("webhook: the owner's PDF goes to the owner assistant, never the customer draft flow", async () => {
    vi.stubEnv("WA_OWNER_NUMBERS", OWNER);
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "1");
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      const b = init?.body ? JSON.parse(init.body) : {};
      if (b.type === "text") sent.push(b.text.body);
      return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
    }));
    const intake = { hasActive: vi.fn(async () => false), handleDocument: vi.fn(async () => ["customer flow"]) };
    const owner = { isOwner: () => true, inCustomerTest: async () => false, handleFile: vi.fn(async () => ["📎 ok"]) };
    const wa = new WhatsappService({ waInboundMessage: { create: async () => ({}) } } as any, intake as any, { touchContact: async () => undefined } as any, {} as any, {} as any, owner as any, { ownerButton: async () => null, ownerText: async () => null } as any);
    vi.spyOn(wa, "downloadMedia").mockResolvedValue({ key: FILE.key, buf: FILE.buf, mime: FILE.mime });
    await wa.handlePayload({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id: "d1", from: OWNER, type: "document", document: { id: "m1", filename: "will-draft.pdf", caption: "कल वसीयत" } }] } }] }] });
    expect(owner.handleFile).toHaveBeenCalledWith(OWNER, expect.objectContaining({ key: FILE.key, fileName: "will-draft.pdf" }), "कल वसीयत");
    expect(intake.handleDocument).not.toHaveBeenCalled();
    expect(sent).toEqual(["📎 ok"]);
  });
});

describe("the file in the app ('मेरे काम')", () => {
  const svc = (role: string, userId: string, row: any) =>
    new TasksService({ task: { findFirst: vi.fn(async ({ where }: any) => (where.assigneeId && where.assigneeId !== row.assigneeId ? null : row)) } } as any, { get: () => ({ userId, organizationId: "org-1", role }) } as any);
  const row = { id: "t9", assigneeId: "u-muskan", documentKey: FILE.key, documentName: "will-draft.pdf", documentMime: "application/pdf" };

  it("the assignee and managers can open it; other staff cannot", async () => {
    const f = await svc("STAFF", "u-muskan", row).documentWeb("t9");
    expect(f).toMatchObject({ mimeType: "application/pdf", fileName: "will-draft.pdf" });
    expect(f.data.toString()).toBe(`bytes of ${FILE.key}`);
    await expect(svc("OWNER", "u-owner", row).documentWeb("t9")).resolves.toBeTruthy();
    await expect(svc("STAFF", "u-other", row).documentWeb("t9")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc("OWNER", "u-owner", { ...row, documentKey: null }).documentWeb("t9")).rejects.toBeInstanceOf(NotFoundException);
  });
});
