import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRegistryDate, crossesNewRates, earliestDay, parseRegistryDate, parseTimeOfDay, registryRules } from "./registry-date.js";
import { geoTagAsk, geoTagConfig, registryAnswer, registryNext, registryReminderText, registrySummaryLines } from "./registry-flow.js";
import { reminderDue, RegistryJobsService } from "./registry-jobs.service.js";
import { registryWhere } from "./wa-requests.service.js";

const TODAY = "2026-10-03"; // Saturday
const rules = (holidays: string[] = []) => ({ minWorkingDays: 2, maxDays: 60, weeklyOff: [0], holidays });

afterEach(() => vi.unstubAllEnvs());

describe("registry date words", () => {
  it.each([
    ["15/10", "2026-10-15"],
    ["15-10-2026", "2026-10-15"],
    ["15.10.26", "2026-10-15"],
    ["२०/१०", "2026-10-20"],
    ["15 अक्टूबर", "2026-10-15"],
    ["5 november", "2026-11-05"],
    ["20 तारीख", "2026-10-20"],
    ["2 तारीख", "2026-11-02"],
    ["1/10", "2027-10-01"],
    ["कल", "2026-10-04"],
    ["parson", "2026-10-05"],
    ["आज", "2026-10-03"],
    ["अगले सोमवार", "2026-10-05"],
    ["agle hafte somvar", "2026-10-12"],
    ["शनिवार", "2026-10-10"],
    ["31/02", null],
    ["जल्दी", null],
  ])("%s → %s", (text, day) => {
    expect(parseRegistryDate(text, TODAY)).toBe(day);
  });

  it("सुबह / दोपहर and 1 / 2", () => {
    expect(parseTimeOfDay("1")).toBe("MORNING");
    expect(parseTimeOfDay("दोपहर")).toBe("AFTERNOON");
    expect(parseTimeOfDay("subah")).toBe("MORNING");
    expect(parseTimeOfDay("पता नहीं")).toBeNull();
  });
});

describe("registry date checks", () => {
  it("2 working days ahead, Sunday and the owner's holidays closed, at most 60 days", () => {
    expect(earliestDay(TODAY, rules())).toBe("2026-10-06"); // Sun closed → Mon, Tue
    expect(checkRegistryDate("2026-10-02", TODAY, rules())).toMatchObject({ ok: false, code: "past", suggest: "2026-10-06" });
    expect(checkRegistryDate("2026-10-04", TODAY, rules())).toMatchObject({ ok: false, code: "tooSoon", suggest: "2026-10-06" });
    expect(checkRegistryDate("2026-10-11", TODAY, rules())).toMatchObject({ ok: false, code: "closed", suggest: "2026-10-12", holiday: false });
    expect(checkRegistryDate("2026-10-20", TODAY, rules(["2026-10-20"]))).toMatchObject({ ok: false, code: "closed", suggest: "2026-10-21", holiday: true });
    expect(checkRegistryDate("2026-12-03", TODAY, rules())).toMatchObject({ ok: false, code: "tooFar", suggest: null });
    expect(checkRegistryDate("2026-10-15", TODAY, rules())).toEqual({ ok: true, day: "2026-10-15", newRatesWarning: false });
  });

  it("a date from 1 April warns about new guideline rates", () => {
    expect(crossesNewRates("2027-03-01", "2027-03-31")).toBe(false);
    expect(crossesNewRates("2027-03-01", "2027-04-01")).toBe(true);
    expect(crossesNewRates("2026-10-03", "2026-11-01")).toBe(false);
    expect(checkRegistryDate("2027-04-05", "2027-03-01", rules())).toMatchObject({ ok: true, newRatesWarning: true });
  });

  it("config from env", () => {
    vi.stubEnv("REGISTRY_MIN_WORKING_DAYS", "3");
    vi.stubEnv("REGISTRY_MAX_DAYS", "30");
    expect(registryRules(["2026-10-20"])).toEqual({ minWorkingDays: 3, maxDays: 30, weeklyOff: [0], holidays: ["2026-10-20"] });
  });
});

describe("registry questions in the bot", () => {
  const r = rules();

  it("date → second date → time → geo-tag, then the summary", () => {
    let d: any = {};
    expect(registryNext(d)).toBe("REG_DATE");
    let a = registryAnswer("REG_DATE", d, "15/10 सुबह", TODAY, r);
    expect(a).toMatchObject({ done: true, replies: ["✅ रजिस्ट्री की तारीख: 15/10/2026 (गुरुवार)"] });
    d = a.data;
    expect(d).toMatchObject({ regDate: "2026-10-15", regTime: "MORNING" });
    expect(registryNext(d)).toBe("REG_ALT");
    expect(registryAnswer("REG_ALT", d, "15/10", TODAY, r).replies[0]).toContain("वही तारीख");
    d = registryAnswer("REG_ALT", d, "नहीं", TODAY, r).data;
    expect(d.regAlt).toBeNull();
    expect(registryNext(d)).toBe("GEOTAG"); // time came with the date
    expect(registryAnswer("GEOTAG", d, "शायद", TODAY, r).done).toBe(false);
    d = registryAnswer("GEOTAG", d, "1", TODAY, r).data;
    expect(d.geoTagMode).toBe("SELF");
    expect(registryNext(d)).toBeNull();
    expect(registrySummaryLines(d)).toEqual(["रजिस्ट्री की तारीख: 15/10/2026 (गुरुवार), सुबह", "जियो-टैग फ़ोटो: खुद, संपदा 2.0 ऐप से"]);
  });

  it("a Sunday is refused with the next open day; हाँ takes it", () => {
    const a = registryAnswer("REG_DATE", {}, "11/10", TODAY, r);
    expect(a.done).toBe(false);
    expect(a.replies[0]).toContain("रविवार को रजिस्ट्री नहीं होती");
    expect(a.replies[0]).toContain("12/10/2026 (सोमवार)");
    const b = registryAnswer("REG_DATE", a.data, "हाँ", TODAY, r);
    expect(b.data).toMatchObject({ regDate: "2026-10-12" });
    expect(b.data.regSuggest).toBeUndefined();
    expect(registryNext(b.data)).toBe("REG_ALT");
  });

  it("पता नहीं skips the date questions; unknown text re-asks", () => {
    expect(registryAnswer("REG_DATE", {}, "जल्दी करना है", TODAY, r)).toMatchObject({ done: false });
    const d = registryAnswer("REG_DATE", {}, "पता नहीं", TODAY, r).data;
    expect(d).toMatchObject({ regDate: null, regAlt: null });
    expect(registryNext(d)).toBe("GEOTAG");
  });

  it("geo-tag message: contact, wa.me link and fee from config; app link only when set", () => {
    const text = geoTagAsk({ contact: "7222901063", fee: 250, appUrl: null });
    expect(text).toContain("1. खुद — संपदा 2.0 ऐप से फ़ोटो लें\n");
    expect(text).toContain("₹250 प्रति फ़ोटो");
    expect(text).toContain("https://wa.me/917222901063");
    expect(text).not.toContain("http://");
    vi.stubEnv("GEOTAG_FEE", "300");
    vi.stubEnv("GEOTAG_APP_URL", "https://example.gov.in/sampada");
    const d = registryAnswer("GEOTAG", { regRulesShown: true }, "2", TODAY, r);
    expect(d.replies[0]).toContain("₹300 प्रति फ़ोटो");
    expect(geoTagAsk(geoTagConfig())).toContain("(ऐप: https://example.gov.in/sampada)");
  });

  it("day-before reminder asks SELF customers about the photo", () => {
    expect(registryReminderText("AB12CD", "2026-10-15", "11:00", "SELF")).toContain("क्या आपने संपदा 2.0 ऐप से");
    expect(registryReminderText("AB12CD", "2026-10-15", null, "STAFF")).toContain("ऑफिस स्टाफ संपर्क करेगा");
  });
});

describe("registry list filter and reminder job", () => {
  it("today / tomorrow / week on the confirmed date, else the preferred one", () => {
    const now = new Date("2026-10-03T08:00:00Z");
    expect(registryWhere("tomorrow", now)).toEqual({
      OR: [{ registryDate: { gte: "2026-10-04", lte: "2026-10-04" } }, { registryDate: null, preferredDate: { gte: "2026-10-04", lte: "2026-10-04" } }],
    });
    expect(registryWhere("week", now).OR[0]).toEqual({ registryDate: { gte: "2026-10-03", lte: "2026-10-09" } });
  });

  it("reminds once per request, only from the reminder time", async () => {
    vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
    const rows = [{ id: "req-aaaaaa", organizationId: "org-1", phone: "919876543210", registryDate: "2026-10-04", registryTime: "11:00", geoTagMode: "SELF", registryReminderSentAt: null as Date | null }];
    const prisma: any = {
      draftIntake: {
        findMany: vi.fn(async ({ where }: any) => rows.filter((r) => r.registryDate === where.registryDate && !r.registryReminderSentAt)),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const r = rows.find((x) => x.id === where.id && !x.registryReminderSentAt);
          if (r) Object.assign(r, data);
          return { count: r ? 1 : 0 };
        }),
      },
    };
    const outbox = { send: vi.fn(async () => ({})) };
    const jobs = new RegistryJobsService(prisma, outbox as any);
    expect(reminderDue(new Date("2026-10-03T03:00:00Z"))).toBe(false); // 08:30 IST
    expect(await jobs.reminders(new Date("2026-10-03T03:00:00Z"))).toBe(0);
    expect(await jobs.reminders(new Date("2026-10-03T05:00:00Z"))).toBe(1); // 10:30 IST
    expect(await jobs.reminders(new Date("2026-10-03T06:00:00Z"))).toBe(0);
    const call = (outbox.send.mock.calls[0] as any)[0];
    expect(call).toMatchObject({ kind: "REGISTRY", to: "919876543210", template: { name: "registry_reminder" } });
    expect(call.text).toContain("कल 04/10/2026 (रविवार), 11:00 बजे");
    expect(call.template.params[2]).toContain("जियो-टैग");
  });
});
