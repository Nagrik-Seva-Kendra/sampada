import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ArchiveRiskService } from "./archive-risk.service.js";
import { type ArchiveDeedFacts, factsOf, normName, normNumber, riskWarnings, sameProperty } from "./risk-rules.js";

const SALE = (seller: string, buyer: string, plot = "47") => `विक्रय पत्र

विक्रेता पक्ष - श्री ${seller} पुत्र श्री पिता जी (आधार नं. XXXX XXXX 1111) निवासी लश्कर

क्रेता पक्ष - श्रीमती ${buyer} पत्नी श्री पति जी

विक्रीत सम्पत्ति का विवरण -
प्लाट क्रमांक - ${plot}, सालूपुरा कॉलोनी, वार्ड क्रमांक 66, तहसील ग्वालियर, जिला ग्वालियर
जिसकी चतुःसीमा निम्न प्रकार है -
पूर्व - प्लाट क्रमांक 48 श्री पड़ोसी का
इति`;

describe("risk rules", () => {
  it("reads number, place and parties (parents and neighbours are not parties)", () => {
    const f = factsOf(SALE("रामलाल शर्मा", "सीता देवी"));
    expect(f).toMatchObject({ number: "47", ward: "66", tehsil: "ग्वालियर", district: "ग्वालियर", sellers: ["रामलाल शर्मा"], buyers: ["सीता देवी"] });
    expect(f.colony).toContain("सालूपुरा");
    expect(factsOf("सर्वे क्रमांक - १२३/४ ग्राम डोंगरपुर").number).toBe("123/4");
    expect(normNumber(" 47 / 2 ")).toBe("47/2");
    expect(normName("श्री राम सुंदर")).toBe(normName("राम सुन्दर"));
  });

  const deed = (id: string, type: string, sellers: string[], buyers: string[], day: number): ArchiveDeedFacts => ({
    deedId: id,
    deedType: type,
    title: id,
    date: new Date(Date.UTC(2020, 0, day)),
    number: "47",
    colony: "सालूपुरा कॉलोनी",
    village: null,
    ward: "66",
    tehsil: null,
    district: null,
    sellers,
    buyers,
  });
  const target = { number: "47", colony: "सालूपुरा", village: null, ward: "66" };

  it("same property needs the number and the place; ward must agree", () => {
    expect(sameProperty(target, deed("a", "sale-deed", [], [], 1))).toBe(true);
    expect(sameProperty({ ...target, ward: "12" }, deed("a", "sale-deed", [], [], 1))).toBe(false);
    expect(sameProperty({ ...target, number: "48" }, deed("a", "sale-deed", [], [], 1))).toBe(false);
    expect(sameProperty({ ...target, colony: "दूसरी" }, deed("a", "sale-deed", [], [], 1))).toBe(false);
  });

  it("double sale, broken chain, mortgage without re-conveyance", () => {
    const archive = [
      deed("s1", "sale-deed", ["रामलाल"], ["श्याम सुंदर"], 1),
      deed("s2", "sale-deed", ["श्याम सुन्दर"], ["गीता"], 5),
      deed("m1", "equitable-mortgage-deed", ["गीता"], [], 8),
    ];
    // Gita sells now: chain OK (last buyer), mortgage open.
    expect(riskWarnings(target, ["गीता"], archive).map((w) => w.code)).toEqual(["mortgage"]);
    // Shyam sells again: double sale + chain broken + mortgage.
    expect(riskWarnings(target, ["श्री श्याम सुंदर"], archive).map((w) => w.code)).toEqual(["doubleSale", "chain", "mortgage"]);
    // Released by a re-conveyance after the mortgage.
    expect(riskWarnings(target, ["गीता"], [...archive, deed("r1", "reconveyance-deed", [], [], 9)])).toEqual([]);
    // The request's own linked deed is not a warning against itself.
    expect(riskWarnings(target, ["श्याम सुंदर"], [archive[0]!], "s1")).toEqual([]);
    expect(riskWarnings(target, ["गीता"], archive)[0]!.message).toContain("री-कन्वेयन्स");
  });
});

describe("ArchiveRiskService", () => {
  function fake() {
    const t: Record<string, any[]> = {};
    const match = (row: any, where: any = {}) =>
      Object.entries(where).every(([k, v]: [string, any]) => (v && typeof v === "object" && !(v instanceof Date) ? ("in" in v ? v.in.includes(row[k]) : true) : row[k] === v));
    const model = (name: string) => {
      const rows = (t[name] ??= []);
      return {
        findMany: async (a: any = {}) => rows.filter((r) => match(r, a.where)),
        findFirst: async (a: any = {}) => rows.find((r) => match(r, a.where)) ?? null,
        count: async (a: any = {}) => rows.filter((r) => match(r, a.where)).length,
        upsert: async (a: any) => {
          const row = rows.find((r) => match(r, a.where));
          if (row) return Object.assign(row, a.update);
          rows.push({ ...a.create });
          return a.create;
        },
      };
    };
    const p: any = { t, deedTemplate: model("deedTemplate"), propertyIndexEntry: model("propertyIndexEntry"), draftIntake: model("draftIntake") };
    p.$unscoped = p;
    return p;
  }

  it("indexes the archive, then warns on the request's property (assignee or manager only)", async () => {
    const prisma = fake();
    const now = new Date();
    prisma.t.deedTemplate.push(
      { id: "s1", organizationId: "org-1", type: "sale-deed", title: "पुरानी 1", content: SALE("रामलाल", "राधेश्याम"), createdAt: new Date("2020-01-01"), updatedAt: now },
      { id: "x", organizationId: "org-1", type: "will-deed", title: "वसीयत", content: SALE("a", "b"), createdAt: now, updatedAt: now },
    );
    prisma.t.draftIntake.push({
      id: "req-1",
      organizationId: "org-1",
      phone: "919876543210",
      status: "SUBMITTED",
      assigneeId: "u-emp",
      needsStaff: false,
      createdAt: now,
      updatedAt: now,
      data: { deedType: "sale" },
      deed: { isSaleDeed: true, buyers: [{ name: "रामलाल", relation: null }], property: { propertyType: "residential_plot", locality: "वार्ड 66, सालूपुरा कॉलोनी", khasraOrPlotNo: "47", village: null, tehsil: "ग्वालियर", district: "ग्वालियर" } },
    });
    const cls = (role: string, userId: string): any => ({ get: () => ({ userId, organizationId: "org-1", membershipId: "m", role }) });
    const s = new ArchiveRiskService(prisma, cls("OWNER", "u-owner"));
    expect(await s.backfill("org-1")).toBe(1); // will-deed not indexed
    expect(await s.backfill("org-1")).toBe(0); // unchanged
    const r = await new ArchiveRiskService(prisma, cls("EMPLOYEE", "u-emp")).forRequest("req-1");
    expect(r.checked).toBe(true);
    expect(r.sameProperty).toBe(1);
    expect(r.warnings.map((w) => w.code)).toEqual(["doubleSale", "chain"]);
    expect(r.index.indexed).toBe(1);
    await expect(new ArchiveRiskService(prisma, cls("EMPLOYEE", "u-other")).forRequest("req-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
