import { ForbiddenException } from "@nestjs/common";
import { DEFAULT_OFFICE_FEES, SatisfactionSettingsInput } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checklistText, DEFAULT_CORRECTION_POLICY, fullCostText, packetText, ratingReply, simpleSummary } from "./satisfaction.js";
import { SatisfactionService } from "./satisfaction.service.js";

const PHONE = "919876543210";
const ORG = "org-1";

describe("satisfaction texts", () => {
  const d = { deedType: "sale", buyerName: "श्याम", buyerRelation: "पत्नी", amount: 1_000_000, guideline: { marketValue: 1_200_000, stamp: { sdPct: 0.075 } }, geoTagMode: "STAFF", regDate: "2026-10-15" };

  it("full cost up front: on the higher value, woman buyer 1%, office fee, geo-tag line, total", () => {
    const t = fullCostText(d, DEFAULT_OFFICE_FEES, 250)!;
    expect(t).toContain("गणना ₹12,00,000 पर");
    expect(t).toContain("स्टाम्प शुल्क (7.5%): ₹90,000");
    expect(t).toContain("पंजीयन शुल्क (महिला क्रेता 1%): ₹12,000");
    expect(t).toMatch(/ऑफिस शुल्क: ₹[\d,]+/);
    expect(t).toContain("₹250 प्रति फ़ोटो");
    expect(t).toMatch(/कुल लगभग: ₹[\d,]+ \+ जियो-टैग/);
    expect(fullCostText({ deedType: "sale", buyerRelation: "पुत्र" }, DEFAULT_OFFICE_FEES, 250)).toContain("स्टाफ पूरा खर्च बताएगा");
    expect(fullCostText({ deedType: "other" }, DEFAULT_OFFICE_FEES, 250)).toBeNull();
  });

  it("summary, checklist, packet, rating replies", () => {
    expect(simpleSummary("AB12CD", d)).toContain("पसंद की रजिस्ट्री तारीख: 15/10/2026 (गुरुवार)");
    expect(checklistText({ deedType: "sale", geoTagMode: "SELF" })).toContain("जियो-टैग फ़ोटो (संपदा 2.0 ऐप से ली हुई)");
    expect(checklistText({ deedType: "mortgage" })).toContain("बैंक का सैंक्शन लेटर");
    const p = packetText("AB12CD", d, "2026-10-15", DEFAULT_CORRECTION_POLICY);
    expect(p).toContain("नामांतरण (mutation)");
    expect(p).toContain("संशोधन विलेख");
    expect(ratingReply(5, "https://g.page/r/x/review")).toContain("https://g.page/r/x/review");
    expect(ratingReply(4, null)).not.toContain("http");
    expect(ratingReply(2, "https://x")).toContain("क्या कमी रही");
    expect(SatisfactionSettingsInput.safeParse({ reviewUrl: "http://x", correctionPolicy: DEFAULT_CORRECTION_POLICY, ratingDelayHours: 24, ratingsEnabled: true }).success).toBe(false);
  });
});

function fakePrisma() {
  const t: Record<string, any[]> = {};
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      const x = row[k];
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("not" in v) return x !== v.not;
        if ("lte" in v || "gte" in v) return (!("lte" in v) || (x && x <= v.lte)) && (!("gte" in v) || (x && x >= v.gte));
        return true;
      }
      return v === null ? x == null : x === v;
    });
  const model = (name: string) => {
    const rows = (t[name] ??= []);
    return {
      findMany: async (a: any = {}) => rows.filter((r) => match(r, a.where)),
      findFirst: async (a: any = {}) => rows.filter((r) => match(r, a.where)).sort((x, y) => (y.createdAt?.getTime?.() ?? 0) - (x.createdAt?.getTime?.() ?? 0))[0] ?? null,
      findUnique: async (a: any) => rows.find((r) => match(r, a.where)) ?? null,
      update: async (a: any) => Object.assign(rows.find((r) => match(r, a.where)), a.data),
      updateMany: async (a: any) => {
        const hit = rows.filter((r) => match(r, a.where));
        hit.forEach((r) => Object.assign(r, a.data));
        return { count: hit.length };
      },
      upsert: async (a: any) => {
        const row = rows.find((r) => match(r, a.where));
        if (row) return Object.assign(row, a.update);
        rows.push({ ...a.create });
        return a.create;
      },
    };
  };
  return { t, draftIntake: model("draftIntake"), waContact: model("waContact"), satisfactionConfig: model("satisfactionConfig"), waOfficeFeeConfig: model("waOfficeFeeConfig"), user: model("user") } as any;
}

describe("SatisfactionService", () => {
  let prisma: any;
  let outbox: any;
  const svc = (role = "OWNER") => new SatisfactionService(prisma, { get: () => ({ userId: "u1", organizationId: ORG, membershipId: "m", role }) } as any, outbox);

  beforeEach(() => {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    vi.stubEnv("WA_OWNER_NUMBERS", "919000000001");
    prisma = fakePrisma();
    outbox = { deliverDirect: vi.fn(async () => ({ status: "SENT" })), send: vi.fn(async () => ({})) };
    prisma.t.draftIntake.push({
      id: "cmreq00000xyz123",
      organizationId: ORG,
      phone: PHONE,
      status: "SUBMITTED",
      workStatus: "DONE",
      closedAt: new Date("2026-10-01T06:00:00Z"),
      ratingAskedAt: null,
      createdAt: new Date("2026-09-20"),
      data: { deedType: "sale" },
      assigneeId: "u-emp",
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks for a rating once, after the delay; 5 → review link; 2 → feedback to the owner", async () => {
    await svc().save({ reviewUrl: "https://g.page/r/nsk/review", correctionPolicy: DEFAULT_CORRECTION_POLICY, ratingDelayHours: 24, ratingsEnabled: true });
    expect(await svc().askRatings(new Date("2026-10-01T20:00:00Z"))).toBe(0); // too early
    expect(await svc().askRatings(new Date("2026-10-02T07:00:00Z"))).toBe(1);
    expect(await svc().askRatings(new Date("2026-10-02T08:00:00Z"))).toBe(0); // once
    expect(outbox.deliverDirect.mock.calls[0][2].name).toBe("service_rating_request");
    const r = await svc().handle(PHONE, "५", new Date("2026-10-02T09:00:00Z"));
    expect(r![0]).toContain("https://g.page/r/nsk/review");
    expect(prisma.t.draftIntake[0].rating).toBe(5);

    prisma.t.draftIntake[0].ratingAskedAt = null;
    await svc().askRatings(new Date("2026-10-02T10:00:00Z"));
    expect((await svc().handle(PHONE, "2", new Date("2026-10-02T11:00:00Z")))![0]).toContain("क्या कमी रही");
    expect((await svc().handle(PHONE, "स्टाफ ने देर से जवाब दिया", new Date("2026-10-02T11:05:00Z")))![0]).toContain("मालिक तक");
    expect(prisma.t.draftIntake[0]).toMatchObject({ rating: 2, feedback: "स्टाफ ने देर से जवाब दिया" });
    expect(outbox.deliverDirect.mock.calls.filter((c: any) => c[0] === "919000000001").length).toBeGreaterThanOrEqual(2);
    const s = await svc("ADMIN").settings();
    expect(s.stats).toMatchObject({ rated: 1, average: 2, low: 1 });
    expect(s.lowRatings[0]!.feedback).toBe("स्टाफ ने देर से जवाब दिया");
  });

  it("corrections before DONE are recorded; after DONE the correction-deed policy", async () => {
    prisma.t.draftIntake[0].workStatus = "IN_PROGRESS";
    expect((await svc().handle(PHONE, "सुधार"))![0]).toContain("साथ में लिखें");
    expect((await svc().handle(PHONE, "सुधार: पिता का नाम मोहन लाल है"))![0]).toContain("सुधार अनुरोध XYZ123 में दर्ज");
    expect(prisma.t.draftIntake[0].corrections).toEqual([{ text: "पिता का नाम मोहन लाल है", at: expect.any(String) }]);
    prisma.t.draftIntake[0].workStatus = "DONE";
    expect((await svc().handle(PHONE, "गलती है नाम में"))![0]).toContain("संशोधन विलेख");
    expect((await svc().handle(PHONE, "चेकलिस्ट"))![0]).toContain("2 गवाह");
    expect(await svc().handle(PHONE, "नमस्ते")).toBeNull();
  });

  it("after submit: summary + full cost + checklist; only the owner edits settings", async () => {
    const out = await svc().afterSubmit(ORG, "cmreq00000xyz123", { deedType: "sale", amount: 1_500_000, buyerRelation: "पुत्र" });
    expect(out).toHaveLength(3);
    expect(out[1]).toContain("पंजीयन शुल्क (3%): ₹45,000");
    await expect(svc("ADMIN").save({ reviewUrl: "", correctionPolicy: DEFAULT_CORRECTION_POLICY, ratingDelayHours: 24, ratingsEnabled: true })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
