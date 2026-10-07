import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { CustomerQuestionsService } from "./customer-questions.service.js";
import { matchLearned, parseQuestionCommand, questionKeys } from "./customer-questions.js";
import { FrontDoorService } from "./front-door.service.js";

const CUSTOMER = "919000004444";
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org1");
  vi.stubEnv("WA_ACCESS_TOKEN", "t");
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("owner commands", () => {
  it.each([
    ["जवाब 12 हाँ, हो सकती है", { kind: "answer", n: 12, answer: "हाँ, हो सकती है" }],
    ["jawab #7: NRI ka POA chahiye", { kind: "answer", n: 7, answer: "NRI ka POA chahiye" }],
    ["Answer 3 - yes", { kind: "answer", n: 3, answer: "yes" }],
    ["याद रखो 12", { kind: "learn", n: 12 }],
    ["yaad rakho #12", { kind: "learn", n: 12 }],
    ["भूल जाओ 12", { kind: "forget", n: 12 }],
    ["सवाल", { kind: "list" }],
    ["sawal", { kind: "list" }],
  ])("%s", (text, cmd) => {
    expect(parseQuestionCommand(text)).toEqual(cmd);
  });

  it.each(["कल रमेश की रजिस्ट्री है", "12 हो गया", "जवाब", "सवाल पूछना है"])("%s → not a question command", (text) => {
    expect(parseQuestionCommand(text)).toBeNull();
  });
});

describe("matching a remembered answer", () => {
  const learned = [{ id: "a", keys: questionKeys("kya NRI ki registry ho sakti hai") }];
  it("the same question in other words / script matches", () => {
    expect(matchLearned("NRI ki registry kaise hogi?", learned)?.id).toBe("a");
    expect(matchLearned("क्या NRI की रजिस्ट्री हो सकती है", learned)?.id).toBe("a");
  });
  it("a different question does not", () => {
    expect(matchLearned("registry ka kharcha kitna hai", learned)).toBeNull();
    expect(matchLearned("NRI", learned)).toBeNull();
    expect(matchLearned("NRI ki property par loan kaise milega", learned)).toBeNull();
  });
});

function world() {
  const questions: any[] = [];
  const learned: any[] = [];
  const contacts = new Map<string, any>([[CUSTOMER, { phone: CUSTOMER, lastInboundAt: new Date(), gibberishStreak: 0 }]]);
  const prisma: any = new Proxy(
    {
      waContact: {
        findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null,
        upsert: async ({ where, create, update }: any) => {
          const c = contacts.get(where.phone);
          contacts.set(where.phone, c ? { ...c, ...update } : { gibberishStreak: 0, ...create });
        },
        update: async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data }),
        updateMany: async () => ({ count: 1 }),
      },
      waOfficeFeeConfig: { findUnique: async () => null },
      waQuestion: {
        count: async ({ where }: any) => questions.filter((q) => q.phone === where.phone && q.createdAt >= where.createdAt.gte).length,
        findFirst: async () => [...questions].sort((a, b) => b.number - a.number)[0] ?? null,
        create: async ({ data }: any) => {
          const q = { id: `q${data.number}`, status: "OPEN", answer: null, createdAt: new Date(), ...data };
          questions.push(q);
          return q;
        },
        findUnique: async ({ where }: any) => questions.find((q) => q.number === where.organizationId_number.number) ?? null,
        update: async ({ where, data }: any) => Object.assign(questions.find((q) => q.id === where.id), data),
        findMany: async () => questions.filter((q) => q.status === "OPEN"),
      },
      waLearnedAnswer: {
        findMany: async () => learned.filter((l) => l.enabled),
        create: async ({ data }: any) => learned.push({ id: `l${learned.length}`, enabled: true, uses: 0, ...data }),
        update: async ({ where, data }: any) => {
          const l = learned.find((x) => x.id === where.id);
          l.uses += data.uses.increment;
        },
        updateMany: async ({ where }: any) => {
          const hit = learned.filter((l) => l.questionNumber === where.questionNumber && (where.enabled === undefined || l.enabled === where.enabled));
          hit.forEach((l) => (l.enabled = false));
          return { count: hit.length };
        },
      },
    } as any,
    { get: (t, k) => t[k] ?? { findMany: async () => [], findFirst: async () => null, count: async () => 0 } },
  );
  const sent: { to: string; body: string }[] = [];
  const outbox: any = {
    alertOwners: vi.fn(async () => 1),
    inWindow: vi.fn(async () => true),
    post: vi.fn(async (to: string, m: any) => {
      sent.push({ to, body: m.text.body });
      return { ok: true, wamid: "w", code: null };
    }),
  };
  const qs = new CustomerQuestionsService(prisma, outbox);
  const front = new FrontDoorService(
    prisma,
    outbox,
    { extract: async () => null } as any,
    { lookup: async () => null } as any,
    {} as any,
    { reply: async () => null } as any,
    { settings: async () => DEFAULT_ATTENDANCE_SETTINGS, holidays: async () => [] } as any,
    undefined,
    undefined,
    qs,
  );
  const tasks = { create: vi.fn() };
  const owner = new OwnerAssistantService(prisma, tasks as any, {} as any, { extract: vi.fn() } as any, outbox, undefined, undefined, qs);
  return {
    questions,
    learned,
    outbox,
    sent,
    tasks,
    customer: (t: string, now?: Date) => front.handle(CUSTOMER, t, async () => null, now),
    owner: (t: string) => owner.handle("919999900000", { type: "text", text: t }),
  };
}

describe("the whole loop", () => {
  it("question → owner alert with a number → 'जवाब 1 ...' reaches the customer → 'याद रखो 1' → the bot answers the next one itself", async () => {
    const w = world();
    const r = await w.customer("seller ke upar court case chal raha hai to kya hoga?");
    expect(r.route).toBe("question-forwarded");
    expect(w.questions).toHaveLength(1);
    const alert = String(w.outbox.alertOwners.mock.calls[0][0]);
    expect(alert).toContain("सवाल #1");
    expect(alert).toContain("+91 90000 04444");
    expect(alert).toContain("जवाब 1 <आपका जवाब>");

    const a = await w.owner("जवाब 1 केस चल रहा हो तो पहले कोर्ट से स्थिति साफ़ करें, फिर रजिस्ट्री होगी।");
    expect(a[0]).toContain("जवाब ग्राहक को भेज दिया");
    expect(a[0]).toContain("याद रखो 1");
    expect(w.sent).toEqual([{ to: CUSTOMER, body: expect.stringContaining("पहले कोर्ट से स्थिति साफ़ करें") }]);
    expect(w.questions[0].status).toBe("ANSWERED");
    expect(w.tasks.create).not.toHaveBeenCalled();

    expect((await w.owner("याद रखो 1"))[0]).toContain("याद रख लिया");
    const again = await w.customer("Court case chal raha hai seller par, kya hoga ab?");
    expect(again.route).toBe("learned");
    expect(again.replies[0]).toContain("पहले कोर्ट से स्थिति साफ़ करें");
    expect(w.questions).toHaveLength(1);

    expect((await w.owner("भूल जाओ 1"))[0]).toContain("अब बॉट नहीं देगा");
    expect((await w.customer("Court case chal raha hai seller par, kya hoga ab?")).route).toBe("question-forwarded");
  });

  it("customer outside the 24h window: the answer is saved and the owner is told to call", async () => {
    const w = world();
    await w.customer("seller ke upar court case hai kya hoga?");
    w.outbox.inWindow.mockResolvedValue(false);
    const a = await w.owner("जवाब 1 पहले केस का फ़ैसला देखें");
    expect(a[0]).toContain("24 घंटे");
    expect(a[0]).toContain("+91 90000 04444");
    expect(w.sent).toHaveLength(0);
    expect(w.questions[0].answer).toBe("पहले केस का फ़ैसला देखें");
  });

  it("'सवाल' lists open ones; unknown numbers and learning before answering are explained", async () => {
    const w = world();
    await w.customer("seller ke upar court case hai kya hoga?");
    expect((await w.owner("सवाल"))[0]).toContain("#1 +91 90000 04444");
    expect((await w.owner("जवाब 9 हाँ"))[0]).toContain("#9 नहीं मिला");
    expect((await w.owner("याद रखो 1"))[0]).toContain("पहले लिखें: जवाब 1");
  });

  it("many questions at once: at most 3 numbered alerts in 10 minutes", async () => {
    const w = world();
    const t0 = new Date();
    for (let i = 0; i < 5; i++) await w.customer(`seller ke upar court case number ${i} hai kya hoga?`, t0);
    expect(w.questions).toHaveLength(3);
  });

  it("logs carry the question number, never the text or the number", async () => {
    const w = world();
    await w.customer("seller ke upar court case hai kya hoga?");
    await w.owner("जवाब 1 पहले केस देखें");
    const all = logged.join("\n");
    expect(all).toContain("question #1");
    expect(all).not.toContain("court");
    expect(all).not.toContain("4444");
  });
});
