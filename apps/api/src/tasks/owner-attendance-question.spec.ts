import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceService } from "../attendance/attendance.service.js";
import { OwnerAssistantService } from "../whatsapp/owner-assistant.service.js";
import { hasTaskInstruction, isAttendanceQuestion, isQuestion, looksLikeTask, QUESTION_HELP, TASK_OR_QUESTION } from "./task-rules.js";

const OWNER = "919111111111";
const NOW = new Date("2026-10-06T14:34:00Z"); // 8:04 PM IST
const REPORT = "🕘 आज की हाज़िरी अभी तक (06/10, 8:04 PM)\n🌆 OUT नहीं किया (3): Anmol Kandoi (IN 10:02 AM), Rohit Senwar (IN 10:10 AM), Rohit Sharma (IN 10:15 AM)";

beforeEach(() => {
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function world() {
  const contacts = new Map<string, any>();
  const prisma: any = {
    waContact: {
      findUnique: vi.fn(async ({ where }: any) => contacts.get(where.phone) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const c = contacts.get(where.phone);
        contacts.set(where.phone, c ? { ...c, ...update } : { ...create });
      }),
    },
  };
  const extractor = { extract: vi.fn(async () => ({ title: "x", partyName: null, partyPhone: null, workType: "other", place: null, dueAt: null, note: null })) };
  const attendance = { todayReport: vi.fn(async () => REPORT) };
  const owner = new OwnerAssistantService(prisma, {} as any, {} as any, extractor as any, {} as any, attendance as any);
  return { contacts, extractor, attendance, say: (t: string) => owner.handle(OWNER, { type: "text", text: t }, NOW) };
}

describe("owner: attendance questions are answered, not turned into tasks", () => {
  it.each([
    "अटेंडेंस किस-किस ने नहीं lagao",
    "attendance kisne nahi lagayi",
    "अटेंडेंस किसने नहीं लगाई",
    "हाज़िरी बताओ",
    "aaj haziri kis kis ki baki hai",
    "कौन आया",
    "aaj kaun aaya?",
    "कौन छुट्टी पर है",
    "kaun chhutti pe hai",
    "IN/OUT किसका बाकी",
    "out kisne nahi kiya",
  ])("%s → attendance question", (t) => {
    expect(isAttendanceQuestion(t)).toBe(true);
  });

  it.each(["रमेश शर्मा की रजिस्ट्री सोमवार तक", "Rohit ko kal chhutti de do registry ke liye bank jana hai", "hello", "रमेश को फोन करना है"])(
    "%s → not an attendance question",
    (t) => {
      expect(isAttendanceQuestion(t)).toBe(false);
    },
  );

  it("8:04 PM 'अटेंडेंस किस-किस ने नहीं lagao' → today's attendance from the attendance data; no task proposed", async () => {
    const w = world();
    expect(await w.say("अटेंडेंस किस-किस ने नहीं lagao")).toEqual([REPORT]);
    expect(w.attendance.todayReport).toHaveBeenCalledWith("org-1", NOW);
    expect(w.extractor.extract).not.toHaveBeenCalled();
    expect(w.contacts.get(OWNER)?.state ?? null).toBeNull();
  });

  it("asked while a task waits for हाँ: answered, and the task still waits", async () => {
    const w = world();
    w.contacts.set(OWNER, { phone: OWNER, state: { mode: "task-confirm", draft: {}, transcript: "x", source: "text" } });
    const r = await w.say("कौन छुट्टी पर है?");
    expect(r[0]).toBe(REPORT);
    expect(r[1]).toContain("पुष्टि के लिए बाकी");
    expect(w.contacts.get(OWNER).state.mode).toBe("task-confirm");
  });
});

describe("owner: a question without a clear instruction is not a task", () => {
  it("detectors", () => {
    expect(isQuestion("रमेश की फाइल किसके पास है?")).toBe(true);
    expect(isQuestion("रमेश शर्मा की रजिस्ट्री सोमवार तक")).toBe(false);
    expect(hasTaskInstruction("रमेश की फाइल किसके पास है?", NOW)).toBe(false);
    expect(hasTaskInstruction("क्या रमेश की रजिस्ट्री सोमवार तक बनानी है?", NOW)).toBe(true);
    expect(looksLikeTask("रमेश की फाइल किसके पास है?", NOW)).toBe(true); // why the guard is needed
  });

  it("asks 'काम दर्ज करूँ या सवाल?'; 1 → task proposal, 2 → what the bot can answer", async () => {
    const w = world();
    expect(await w.say("रमेश की फाइल किसके पास है?")).toEqual([TASK_OR_QUESTION]);
    expect(w.extractor.extract).not.toHaveBeenCalled();
    expect((await w.say("1"))[0]).toContain("ठीक?");
    expect(w.extractor.extract).toHaveBeenCalledWith("रमेश की फाइल किसके पास है?", NOW);

    const w2 = world();
    await w2.say("रमेश की फाइल किसके पास है?");
    expect(await w2.say("2")).toEqual([QUESTION_HELP]);
    expect(w2.contacts.get(OWNER).state?.mode).toBeUndefined();
    expect(w2.extractor.extract).not.toHaveBeenCalled();
  });

  it("a clear instruction with a question mark is still a task", async () => {
    const w = world();
    expect((await w.say("क्या रमेश की रजिस्ट्री सोमवार तक बनानी है?"))[0]).toContain("ठीक?");
  });
});

describe("AttendanceService.todayReport", () => {
  const svc = (rows: any[]) => {
    const s = Object.create(AttendanceService.prototype);
    s.grid = vi.fn(async () => rows.map((d) => ({ userId: d.name, name: d.name, days: [d] })));
    return s as AttendanceService;
  };
  const d = (name: string, status: string, inAt: string | null = null, outAt: string | null = null, extra: any = {}) => ({ name, status, inAt, outAt, lateMin: 0, field: [], ...extra });

  it("IN not done, OUT not done, leave, field, came -- in the evening report's words", async () => {
    const text = await svc([
      d("Anmol Kandoi", "present", "2026-10-06T04:32:00Z"),
      d("Rohit Sharma", "late", "2026-10-06T04:45:00Z", null, { lateMin: 15 }),
      d("Sunita", "present", "2026-10-06T04:30:00Z", "2026-10-06T13:00:00Z"),
      d("Vikas", "absent"),
      d("Pooja", "leave"),
      d("Ravi", "halfLeave"),
      d("Mohan", "field", null, null, { field: [{ reason: "तहसील" }] }),
    ]).todayReport("org-1", NOW);
    expect(text).toContain("❌ IN नहीं किया (1): Vikas");
    expect(text).toContain("🌆 OUT नहीं किया (2): Anmol Kandoi (IN 10:02");
    expect(text).toContain("Rohit Sharma (IN 10:15");
    expect(text).toContain("🏖️ छुट्टी (2): Pooja, Ravi (आधा दिन)");
    expect(text).toContain("🚶 बाहर का काम (1): Mohan — तहसील");
    expect(text).toContain("✅ आए (3)");
    expect(text).toContain("(15 मिनट देर)");
  });

  it("an office holiday, and everyone done", async () => {
    expect(await svc([d("A", "holiday"), d("B", "holiday")]).todayReport("org-1", NOW)).toContain("ऑफिस की छुट्टी है");
    const done = await svc([d("A", "present", "2026-10-06T04:30:00Z", "2026-10-06T13:00:00Z")]).todayReport("org-1", NOW);
    expect(done).toContain("✅ आए (1)");
    expect(done).not.toContain("OUT नहीं किया");
  });
});
