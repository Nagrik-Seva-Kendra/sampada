/**
 * Owner's WhatsApp task: "कल एक वसीयत होनी है मुस्कान मैडम को असाइन कर दो".
 * All mocked: the model call is stubbed and no real WhatsApp message is sent.
 */
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAssistantService } from "../whatsapp/owner-assistant.service.js";
import { TaskExtractorService } from "./task-extractor.service.js";
import { confirmText, istDate, resolveAssignee } from "./task-rules.js";

const OWNER = "919111111111";
const NOW = istDate(2026, 9, 6, 20, 43); // Tue 6 Oct 2026, 8:43 PM IST
const TEXT = "कल एक वसीयत होनी है मुस्कान मैडम को असाइन कर दो";
const STAFF = [
  { userId: "u-muskan", fname: "Muskan", lname: "Mishra", mobile: "7974876905" },
  { userId: "u-rohit1", fname: "Rohit", lname: "Sharma", mobile: "8109275681" },
  { userId: "u-rohit2", fname: "Rohit", lname: "Senwar", mobile: null },
];

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

/** The model's answer for the note (what a real reply looks like). */
const modelSays = (over: Record<string, unknown> = {}) => ({ title: "वसीयत", partyName: null, workType: "other", place: null, dueText: "कल", note: null, assignee: "Muskan Mishra", ...over });

function world(model: Record<string, unknown> = modelSays()) {
  const contacts = new Map<string, any>();
  const tasks: any[] = [];
  const prisma: any = {
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { ...create });
      }),
    },
    membership: { findMany: vi.fn(async () => STAFF.map((u) => ({ user: { id: u.userId, fname: u.fname, lname: u.lname, mobile: u.mobile } }))) },
    user: { findFirst: vi.fn(async () => ({ id: "u-owner" })) },
  };
  const tasksSvc = {
    create: vi.fn(async (_org: string, t: any) => {
      const row = { id: `t${tasks.length + 1}`, number: tasks.length + 7, ...t };
      tasks.push(row);
      return row;
    }),
  };
  // The real extractor, with the model call stubbed: checks what it is sent.
  const sentToModel: string[] = [];
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: any) => {
      sentToModel.push(JSON.parse(init.body).messages[0].content);
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(model) }] }), { status: 200 });
    }),
  );
  const outbox = { deliverDirect: vi.fn(async () => ({ status: "SENT", via: "text", reason: null })) };
  const owner = new OwnerAssistantService(prisma, tasksSvc as any, {} as any, new TaskExtractorService(), outbox as any, undefined);
  return { contacts, tasks, outbox, sentToModel, say: (t: string, now = NOW) => owner.handle(OWNER, { type: "text", text: t }, now) };
}

describe("owner gives the work to a staff member", () => {
  it("'मुस्कान मैडम को असाइन कर दो' → सौंपा: Muskan Mishra; हाँ → task assigned, Muskan told on WhatsApp", async () => {
    const w = world();
    const r = (await w.say(TEXT))[0]!;
    expect(r).toContain("काम दर्ज: पार्टी का नाम नहीं - वसीयत - बुध, 7 अक्टू");
    expect(r).toContain("सौंपा: Muskan Mishra");
    // The model gets the Team names only -- never their numbers.
    expect(w.sentToModel[0]).toContain("STAFF: Muskan Mishra, Rohit Sharma, Rohit Senwar");
    expect(w.sentToModel[0]).not.toMatch(/7974876905|8109275681/);

    const done = await w.say("हाँ");
    expect(w.tasks[0]).toMatchObject({ title: "वसीयत", assigneeId: "u-muskan" });
    expect(done[0]).toContain("✅ काम #7 दर्ज हो गया");
    expect(done[1]).toBe("👤 Muskan Mishra को सौंपा और WhatsApp पर बता दिया।");
    const [to, text, template] = w.outbox.deliverDirect.mock.calls[0]! as any[];
    expect(to).toBe("917974876905");
    expect(text).toContain("नमस्ते Muskan, ऑफिस से नया काम #7:");
    expect(text).toContain("वसीयत");
    expect(template).toMatchObject({ name: "staff_task", params: ["Muskan", expect.stringContaining("#7 वसीयत")] });
  });

  it("a name not in Team → asked to correct; two staff with the same first name → not guessed", async () => {
    const w = world(modelSays({ assignee: "Pinki" }));
    const r = (await w.say(TEXT))[0]!;
    expect(r).toContain('⚠️ "Pinki" Team में नहीं मिला');
    expect(resolveAssignee("Rohit", [{ userId: "a", name: "Rohit Sharma" }, { userId: "b", name: "Rohit Senwar" }])).toBeNull();
    expect(resolveAssignee("rohit sharma", [{ userId: "a", name: "Rohit Sharma" }, { userId: "b", name: "Rohit Senwar" }])?.userId).toBe("a");
    expect(resolveAssignee("Muskan", [{ userId: "m", name: "Muskan Mishra" }])?.userId).toBe("m");
  });

  it("assigned staff without a mobile: assigned, owner told WhatsApp could not go", async () => {
    const w = world(modelSays({ assignee: "Rohit Senwar" }));
    await w.say(TEXT);
    const done = await w.say("हाँ");
    expect(w.tasks[0].assigneeId).toBe("u-rohit2");
    expect(done[1]).toContain("मोबाइल Team पेज पर नहीं है");
    expect(w.outbox.deliverDirect).not.toHaveBeenCalled();
  });
});

describe("an unanswered 'ठीक?' does not swallow the next work", () => {
  it("the 8:14 PM attendance-turned-task still waiting at 8:43 PM → dropped; the new note is a new task", async () => {
    const w = world();
    w.contacts.set(OWNER, {
      phone: OWNER,
      state: { mode: "task-confirm", draft: { title: "x", workType: "other" }, transcript: "आज अटेंडेंस किस-किस ने नहीं लगाई है", source: "text", at: istDate(2026, 9, 6, 20, 14).toISOString() },
    });
    const r = await w.say(TEXT);
    expect(r[0]).toBe("(पिछला काम पुष्टि न होने से छोड़ दिया गया।)");
    expect(r[1]).toContain("सौंपा: Muskan Mishra");
    expect(w.sentToModel[0]).not.toContain("अटेंडेंस"); // not a "सुधार" of the old one
  });

  it("a state saved before this change (no time) is dropped too; within 10 minutes it is still a correction", async () => {
    const w = world();
    w.contacts.set(OWNER, { phone: OWNER, state: { mode: "task-confirm", draft: { title: "x", workType: "other" }, transcript: "पुराना", source: "text" } });
    expect((await w.say(TEXT))[0]).toContain("छोड़ दिया");

    const w2 = world();
    await w2.say(TEXT);
    await w2.say("नाम रमेश शर्मा", new Date(NOW.getTime() + 3 * 60_000));
    expect(w2.sentToModel[1]).toContain(`${TEXT}\nसुधार: नाम रमेश शर्मा`);
  });
});

describe("confirm text", () => {
  it("'अन्य' work shows its title", () => {
    const t = confirmText({ title: "वसीयत", partyName: null, partyPhone: null, workType: "other", place: null, dueAt: null, note: null });
    expect(t).toContain("काम दर्ज: पार्टी का नाम नहीं - वसीयत - तारीख नहीं");
  });
});
