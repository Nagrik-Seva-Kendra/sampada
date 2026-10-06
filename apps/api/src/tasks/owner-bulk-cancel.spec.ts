/** "मुस्कान मिश्रा के सारे काम डिलीट कर दो" -- mocked model, no real messages. */
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAssistantService } from "../whatsapp/owner-assistant.service.js";
import { istDate, isBulkCancel } from "./task-rules.js";

const OWNER = "919111111111";
const NOW = istDate(2026, 9, 6, 22, 13);
const TEXT = "पुरानी सारी काम जो मुस्कान मिश्रा को असाइन किए हैं डिलीट कर दो";

beforeEach(() => {
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function world(assignee: string | null = "Muskan Mishra") {
  const contacts = new Map<string, any>();
  const open = [
    { id: "t2", number: 2, title: "यह वसीयत कल होनी है", assigneeId: "u-muskan" },
    { id: "t3", number: 3, title: "वसीयत तैयार करना", assigneeId: "u-muskan" },
    { id: "t5", number: 5, title: "रोहित का काम", assigneeId: "u-rohit" },
  ];
  const prisma: any = {
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { ...create });
      }),
    },
    membership: {
      findMany: vi.fn(async () => [
        { user: { id: "u-muskan", fname: "Muskan", lname: "Mishra", mobile: null } },
        { user: { id: "u-rohit", fname: "Rohit", lname: "Sharma", mobile: null } },
      ]),
    },
  };
  const tasks = { openTasks: vi.fn(async () => open), setStatus: vi.fn(async () => ({})), create: vi.fn() };
  const extractor = { extract: vi.fn(async () => ({ title: "x", partyName: null, partyPhone: null, workType: "other", place: null, dueAt: null, note: null, assigneeName: assignee })) };
  const owner = new OwnerAssistantService(prisma, tasks as any, {} as any, extractor as any, {} as any);
  return { tasks, contacts, say: (t: string) => owner.handle(OWNER, { type: "text", text: t }, NOW) };
}

describe("cancel all of a staff member's tasks", () => {
  it.each([TEXT, "मुस्कान के सारे काम रद्द करो", "muskan ke sab kaam delete karo", "Rohit ke purane task hata do"])("%s → bulk cancel", (t) => {
    expect(isBulkCancel(t)).toBe(true);
  });
  it.each(["3 रद्द", "रमेश की रजिस्ट्री सोमवार तक", "सब स्टाफ को: कल छुट्टी है", "मुस्कान को काम दो"])("%s → not bulk cancel", (t) => {
    expect(isBulkCancel(t)).toBe(false);
  });

  it("the 10:13 PM message: lists Muskan's open tasks, asks; हाँ cancels only hers; never a new task", async () => {
    const w = world();
    const ask = (await w.say(TEXT))[0]!;
    expect(ask).toContain("Muskan Mishra के 2 खुले काम:");
    expect(ask).toContain("#2 यह वसीयत कल होनी है");
    expect(ask).toContain("#3 वसीयत तैयार करना");
    expect(ask).not.toContain("#5");
    expect(ask).toContain('ये सब रद्द करूँ? "हाँ" / "नहीं"');
    expect(w.tasks.create).not.toHaveBeenCalled();
    const done = await w.say("Haan");
    expect(done[0]).toBe('🗑️ 2 काम रद्द कर दिए: #2, #3। (ऐप में "रद्द" टैब में दिखेंगे।)');
    expect(w.tasks.setStatus.mock.calls).toEqual([
      ["t2", "CANCELLED"],
      ["t3", "CANCELLED"],
    ]);
  });

  it("नहीं → nothing cancelled; no name → asked for one", async () => {
    const w = world();
    await w.say(TEXT);
    expect(await w.say("नहीं")).toEqual(["ठीक है, कोई काम रद्द नहीं किया।"]);
    expect(w.tasks.setStatus).not.toHaveBeenCalled();
    const w2 = world(null);
    expect((await w2.say("सारे काम डिलीट कर दो"))[0]).toContain("किसके काम रद्द करने हैं?");
    expect(w2.tasks.setStatus).not.toHaveBeenCalled();
  });
});
