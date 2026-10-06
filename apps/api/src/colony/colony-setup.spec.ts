import { describe, expect, it, vi } from "vitest";
import { GUIDELINE_DATA } from "../whatsapp/guideline/calculator.js";
import { parsePlots, parseUnitRef, plotBlock, readTable, saleChecks } from "./colony-rules.js";
import { boundaryNamesSelf, buildSetupSuggestion, colonyDeedFacts, colonyGuideline, duplicateClauses, guidelineCandidates, markProjectTemplate, maskIds } from "./colony-setup.js";
import { contentChecks, pickProject } from "./colony.service.js";

const SELLER = (other: string, otherFather: string) => `विक्रेता पक्ष - मेसर्स ग्रीन इन्फ्राटेक, पंजीकृत कार्यालय 12 सिटी सेंटर ग्वालियर द्वारा भागीदार श्री महेश गुप्ता पुत्र श्री रमेश गुप्ता आधार 4567 8901 2345 एवं श्री ${other} पुत्र श्री ${otherFather}`;
const MAINT_A =
  "यह कि कॉलोनी के रखरखाव का शुल्क क्रेता 1 अप्रैल 2026 से प्रति माह विक्रेता फर्म अथवा रहवासी समिति को देगा तथा सड़क बिजली पानी की व्यवस्था का रखरखाव समिति करेगी।";
const MAINT_B =
  "यह कि कॉलोनी के रखरखाव का शुल्क क्रेता रजिस्ट्री दिनांक से प्रति माह विक्रेता फर्म अथवा रहवासी समिति को देगा तथा सड़क बिजली पानी की व्यवस्था का रखरखाव समिति करेगी।";
const deed = (o: { other: string; father: string; block: string; plot: string; south: string; buyer: string; aadhaar: string; twoMaint?: boolean; corner?: boolean }) => `विक्रय पत्र

${SELLER(o.other, o.father)}

क्रेता पक्ष - श्री ${o.buyer} पुत्र श्री पुराने पिता आधार नं. ${o.aadhaar} मोबाइल 9876543210

यह कि विक्रेता फर्म की ग्राम डोंगरपुर वार्ड क्रमांक 60 तहसील गिर्द जिला ग्वालियर स्थित सर्वे क्रमांक 101, 102/1 पर विकसित कॉलोनी FLORA CITY का विक्रीत प्लाट -
ब्लॉक - ${o.block}
प्लाट क्रमांक - ${o.plot}${o.corner ? " (कॉर्नर)" : ""}
क्षेत्रफल - 30 फुट x 50 फुट होकर 1500 वर्गफुट यानी 139.35 वर्गमीटर है
जिसकी चतुःसीमा निम्न प्रकार है -
पूर्व - प्लाट 48
पश्चिम - प्लाट 46
उत्तर - 30 फुट रोड
दक्षिण - ${o.south}

यह कि कॉलोनी की विकास अनुमति नगर तथा ग्राम निवेश के पत्र क्रमांक 1234/2024 दिनांक 10.02.2024 द्वारा प्राप्त है।

यह कि कॉलोनी सेल अनुमति क्रमांक 55/2024 दिनांक 15.03.2024 है।

उक्त प्लाट का प्रतिफल रु. 1500000 विक्रेता ने चैक द्वारा प्राप्त कर लिया है।
अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।

${MAINT_A}
${o.twoMaint ? `\n${MAINT_B}\n` : ""}
इति ग्वालियर, दिनांक 05.10.2026`;

const DEEDS = [
  { id: "d1", title: "विक्रय पत्र फ्लोरा सिटी E-20", content: deed({ other: "रोहित जैन", father: "सुरेश जैन", block: "E", plot: "20", south: "प्लाट 20", buyer: "राम लाल", aadhaar: "2345 6789 0123", twoMaint: true }) },
  { id: "d2", title: "विक्रय पत्र फ्लोरा सिटी E-21", content: deed({ other: "रोहित जैन", father: "सुरेश जैन", block: "E", plot: "21", south: "प्लाट 30", buyer: "श्याम लाल", aadhaar: "3456 7890 1234", corner: true }) },
  { id: "d3", title: "phlora siti A-5", content: deed({ other: "अमित शर्मा", father: "विनोद शर्मा", block: "A", plot: "5", south: "प्लाट 9", buyer: "गीता देवी", aadhaar: "5678 9012 3456" }) },
];

describe("Setup from old deeds", () => {
  it("one deed: developer, partner pair, permissions, maintenance, place, survey nos, plot with corner", () => {
    const f = colonyDeedFacts(DEEDS[1]!.content);
    expect(f.developer).toBe("मेसर्स ग्रीन इन्फ्राटेक, पंजीकृत कार्यालय 12 सिटी सेंटर ग्वालियर");
    expect(f.partners).toEqual(["महेश गुप्ता", "रोहित जैन"]);
    expect(f.devPermissions).toHaveLength(2);
    expect(f.village).toBe("डोंगरपुर");
    expect(f.ward).toBe("60");
    expect(f.surveyNos).toEqual(["101", "102/1"]);
    expect(f.plot).toMatchObject({ block: "E", plotNo: "21", ewFt: 30, nsFt: 50, areaSqft: 1500, south: "प्लाट 30", corner: true, floor: null });
    expect(f.kind).toBe("PLOT");
  });

  it("many deeds → variants per partner pair (named by the pair, most used first), sources shown, no party ids in the standard text", () => {
    const s = buildSetupSuggestion(DEEDS, ["FLORA CITY", "फ्लोरा सिटी"]);
    expect(s.partners.map((p) => [p.key, p.label, p.from.map((x) => x.deedId)])).toEqual([
      ["महेश-रोहित", "महेश-रोहित", ["d1", "d2"]],
      ["महेश-अमित", "महेश-अमित", ["d3"]],
    ]);
    expect(s.partners[0]!.text).toContain("भागीदार श्री महेश गुप्ता");
    expect(s.developer).toMatchObject({ value: expect.stringContaining("मेसर्स ग्रीन इन्फ्राटेक"), from: [{ deedId: "d1" }, { deedId: "d2" }, { deedId: "d3" }] });
    expect(s.village?.value).toBe("डोंगरपुर");
    expect(s.surveyNos?.value).toBe("101, 102/1");
    expect(s.devPermissions.map((d) => d.value)).toEqual([expect.stringContaining("1234/2024"), expect.stringContaining("55/2024")]);
    // Owner's decision: one maintenance paragraph, the "रजिस्ट्री दिनांक से देय" form -- even though the old form is in more deeds.
    expect(s.maintenanceClauses.map((m) => m.value)).toEqual([MAINT_B]);
    expect(s.maintenanceChoices).toEqual([{ chosenStart: "रजिस्ट्री दिनांक से", droppedStarts: ["1 अप्रैल 2026 से"] }]);
    expect(s.warnings.join("\n")).toContain('रखरखाव वाला पैरा दो बार है (एक में "1 अप्रैल 2026 से", दूसरे में "रजिस्ट्री दिनांक से") — मानक टेक्स्ट में एक ही रखा गया ("रजिस्ट्री दिनांक से" देय वाला)');
    expect(s.warnings.join("\n")).toContain("चतुःसीमा में वही प्लाट नंबर (20)");
    expect(s.warnings.join("\n")).toContain("भागीदारों की 2 जोड़ियाँ मिलीं: महेश-रोहित (2 डीड), महेश-अमित (1 डीड)");
    // Standard text: all markers, nothing personal.
    const tpl = s.template!.value;
    expect(s.template!.missing).toEqual([]);
    for (const m of ["{{PARTNER}}", "{{BUYER}}", "{{PLOT}}", "{{BOUNDARY}}", "{{PAYMENT}}", "{{DEV_PERMISSION}}", "{{MAINTENANCE}}"]) expect(tpl).toContain(m);
    expect(tpl.match(/\{\{MAINTENANCE\}\}/g)).toHaveLength(1);
    for (const pii of ["2345 6789 0123", "3456", "9876543210", "4567 8901 2345", "राम लाल", "महेश गुप्ता"]) expect(tpl).not.toContain(pii);
    expect(tpl).toContain("इति ग्वालियर, दिनांक ____");
    // Sold plots with their deed.
    expect(s.plots.map((p) => [p.block, p.plotNo, p.corner, p.from.deedId])).toEqual([
      ["E", "20", false, "d1"],
      ["E", "21", true, "d2"],
      ["A", "5", false, "d3"],
    ]);
    expect(s.kind?.value).toBe("PLOT");
    expect(s.guideline[0]).toMatchObject({ sno: 853, plotRes: 42000 });
  });

  it("guideline from the office calculator: Flora City ₹42,000 / sqm, corner +10%", () => {
    const p = { kind: "PLOT", guidelineSno: 853, guidelineRatePerSqm: null };
    const plain = colonyGuideline(p, { areaSqft: 1500, ewFt: 30, nsFt: 50, corner: false })!;
    const corner = colonyGuideline(p, { areaSqft: 1500, ewFt: 30, nsFt: 50, corner: true })!;
    expect(plain.rate).toBe(42000);
    expect(plain.value).toBe(Math.round(42000 * 1500 * 0.092903));
    expect(corner.value).toBe(Math.round(42000 * 1.1 * 1500 * 0.092903));
    expect(corner.how).toContain("कॉर्नर 10%");
    const checks = saleChecks({ consideration: 5_000_000, instalments: [{ date: "2026-10-01", amount: 5_000_000, mode: "rtgs", ref: "" }], buyers: [], plot: { areaSqft: 1500, ewFt: 30, nsFt: 50 }, guideline: corner, otherSaleOfPlot: false, plotSold: false });
    expect(checks.map((c) => c.code)).toEqual(["belowGuideline"]);
    expect(guidelineCandidates(["Woods Business Courtyard"], GUIDELINE_DATA)[0]!.en).toContain("WOODS");
  });

  it("checks on the generated deed: boundary naming the plot sold, maintenance twice", () => {
    expect(boundaryNamesSelf({ plotNo: "20", east: "प्लाट 21", west: null, north: "रोड", south: "प्लाट क्रमांक 20" })).toBe("दक्षिण");
    expect(boundaryNamesSelf({ plotNo: "20", east: "प्लाट 120", west: null, north: null, south: "प्लाट 201" })).toBeNull();
    expect(duplicateClauses(`${MAINT_A}\n\n${MAINT_B}`)).toEqual({ a: "1 अप्रैल 2026 से", b: "रजिस्ट्री दिनांक से" });
    const project = { template: "{{PLOT}}\n\n" + MAINT_B + "\n\n{{MAINTENANCE}}", devPermissions: [], maintenanceClauses: [MAINT_A] };
    const codes = contentChecks(project, { plotNo: "20", east: null, west: null, north: null, south: "प्लाट 20" }).map((c) => c.code);
    expect(codes).toEqual(["boundarySelf", "duplicateClause"]);
  });

  it("shop / unit projects: TF-16 on a floor, its own block text, unit refs and CSV without a block column", () => {
    const shop = `विक्रय पत्र\n\n${SELLER("अमित शर्मा", "विनोद शर्मा")}\n\nक्रेता पक्ष - श्री ग्राहक पुत्र श्री पिता\n\nWOODS BUSINESS COURTYARD में स्थित दुकान क्रमांक TF-16 तृतीय तल पर क्षेत्रफल 320 वर्गफुट\n\nउक्त दुकान का प्रतिफल रु. 2500000 विक्रेता ने चैक द्वारा प्राप्त कर लिया है।`;
    const f = colonyDeedFacts(shop);
    expect(f.kind).toBe("SHOP");
    expect(f.plot).toMatchObject({ block: "", plotNo: "TF-16", areaSqft: 320, floor: "तृतीय तल" });
    expect(plotBlock({ block: "", plotNo: "TF-16", ewFt: null, nsFt: null, areaSqft: 320, floor: "तृतीय तल" }, "SHOP")).toBe(
      "यूनिट / दुकान क्रमांक - TF-16\nतल - तृतीय तल\nक्षेत्रफल - 320 वर्गफुट यानी 29.73 वर्गमीटर है",
    );
    expect(parseUnitRef("दुकान tf 16")).toBe("TF-16");
    expect(parseUnitRef("Woods TF-16 की स्थिति")).toBe("TF-16");
    const p = parsePlots(readTable(Buffer.from("यूनिट क्रमांक,तल,क्षेत्रफल,कॉर्नर\ntf-16,तृतीय तल,320,हाँ\n"), "u.csv"));
    expect(p.plots[0]).toMatchObject({ block: "", plotNo: "TF-16", floor: "तृतीय तल", areaSqft: 320, corner: true });
    expect(colonyGuideline({ kind: "SHOP", guidelineSno: 853, guidelineRatePerSqm: null }, { areaSqft: 320, ewFt: null, nsFt: null, corner: false })!.how).toContain("बहुमंजिला व्यावसायिक");
  });

  it("one company number, two projects: the name in the message picks the project", () => {
    const projects = [
      { name: "FLORA CITY", aliases: "फ्लोरा सिटी" },
      { name: "Woods Business Courtyard", aliases: "वुड्स" },
    ];
    expect(pickProject(projects, "Flora City E-47")?.name).toBe("FLORA CITY");
    expect(pickProject(projects, "वुड्स TF-16")?.name).toBe("Woods Business Courtyard");
    expect(pickProject(projects, "E-47")).toBeNull();
    expect(maskIds("आधार 2345 6789 0123 पैन ABCDE1234F मो. 9876543210 a@b.in")).toBe("आधार ____ पैन ____ मो. ____ ____");
    expect(markProjectTemplate("क्रेता पक्ष - श्री क\n\nप्लाट क्रमांक - 5").found).toEqual(["{{BUYER}}", "{{PLOT}}"]);
  });
});

describe("ColonyService: Setup suggestion, sold plots, company number on two projects", async () => {
  const { ColonyService } = await import("./colony.service.js");
  const { ForbiddenException } = await import("@nestjs/common");
  const ORG = "org-1";
  const ctx = (role = "OWNER") => ({ get: () => ({ userId: "u1", organizationId: ORG, membershipId: "m", role }) }) as any;
  function fake() {
    const plots: any[] = [];
    const projects = [
      { id: "p1", organizationId: ORG, name: "FLORA CITY", aliases: "फ्लोरा सिटी", kind: "PLOT", companyNumbers: ["919713257891"], partners: [], devPermissions: [], maintenanceClauses: [], template: "" },
      { id: "p2", organizationId: ORG, name: "Woods Business Courtyard", aliases: "वुड्स", kind: "SHOP", companyNumbers: ["919713257891"], partners: [], devPermissions: [], maintenanceClauses: [], template: "" },
    ];
    const where = (r: any, w: any) => Object.entries(w ?? {}).every(([k, v]: any) => (v && typeof v === "object" ? true : r[k] === v));
    const prisma: any = {
      colonyProject: { findFirst: async ({ where: w }: any) => projects.find((p) => where(p, w)) ?? null, findMany: async () => projects },
      colonySale: { findMany: async () => [{ deedId: "generated-1" }] },
      deedTemplate: {
        findMany: vi.fn(async ({ where: w }: any) =>
          [...DEEDS, { id: "generated-1", title: "विक्रय पत्र — FLORA CITY ब्लॉक E प्लाट 99", content: DEEDS[0]!.content }]
            .filter((d) => !w.id || w.id.in.includes(d.id))
            .map((d) => ({ ...d, createdAt: new Date() })),
        ),
      },
      colonyPlot: {
        findFirst: async ({ where: w }: any) => plots.find((p) => where(p, w)) ?? null,
        findMany: async ({ where: w }: any) => plots.filter((p) => where(p, w)),
        create: async ({ data }: any) => (plots.push({ id: `pl${plots.length + 1}`, ...data }), data),
        update: async ({ where: w, data }: any) => Object.assign(plots.find((p) => p.id === w.id), data),
        updateMany: async ({ where: w, data }: any) => {
          const hit = plots.filter((p) => where(p, w));
          hit.forEach((p) => Object.assign(p, data));
          return { count: hit.length };
        },
      },
      $unscoped: { $queryRaw: vi.fn(async () => [{ id: "d1" }, { id: "d2" }, { id: "d3" }, { id: "generated-1" }]) },
    };
    return { prisma, plots };
  }

  it("suggests from the old deeds (not the ones it generated itself); imports sold plots; corner toggle; owner/admin only", async () => {
    const { prisma, plots } = fake();
    const s = await new ColonyService(prisma, ctx()).setupSuggest("p1");
    expect(s.deeds.map((d) => d.deedId).sort()).toEqual(["d1", "d2", "d3"]);
    const r = await new ColonyService(prisma, ctx()).importSoldPlots("p1", { plots: s.plots.map(({ from: _f, ...p }) => p) });
    expect(r).toEqual({ added: 3, updated: 0, errors: [] });
    expect(plots.every((p) => p.status === "SOLD")).toBe(true);
    await new ColonyService(prisma, ctx()).setCorner("p1", "pl1", true);
    expect(plots[0].corner).toBe(true);
    await expect(new ColonyService(prisma, ctx("EMPLOYEE")).setupSuggest("p1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("before going live: one maintenance clause is enough; the clause twice in the standard text blocks it", async () => {
    const { prisma } = fake();
    prisma.colonyPlot.count = async () => 5;
    const svc: any = new ColonyService(prisma, ctx());
    const p = {
      id: "p1",
      template: "{{PARTNER}} {{BUYER}} {{PLOT}} {{BOUNDARY}} {{PAYMENT}}\n\n{{MAINTENANCE}}",
      partners: [{ key: "r", label: "रोहित", text: "मेसर्स ग्रीन इन्फ्राटेक द्वारा भागीदार श्री रोहित" }],
      devPermissions: ["अनुमति 1", "अनुमति 2"],
      maintenanceClauses: [MAINT_B, ""],
    };
    expect(await svc.readiness(p)).toEqual([]);
    const twice = await svc.readiness({ ...p, template: `${p.template}\n\n${MAINT_A}` });
    expect(twice.join(" ")).toContain("रखरखाव वाला पैरा डीड में दो बार आएगा");
    expect((await svc.readiness({ ...p, maintenanceClauses: ["", ""] })).join(" ")).toContain("{{MAINTENANCE}} है पर रखरखाव की शर्त खाली है");
  });

  it("9713257891 on Flora City and Woods: the name picks the project, otherwise it asks; then remembers", async () => {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    const { prisma, plots } = fake();
    plots.push({ id: "u1", projectId: "p2", block: "", plotNo: "TF-16", status: "AVAILABLE", areaSqft: 320, floor: "तृतीय तल" });
    const svc = new ColonyService(prisma, ctx());
    const ask = await svc.handleCompany("919713257891", "स्थिति");
    expect(ask![0]).toContain("2 प्रोजेक्ट से जुड़ा है");
    expect(ask![0]).toContain("Woods Business Courtyard");
    const unit = await svc.handleCompany("919713257891", "Woods TF-16");
    expect(unit![0]).toContain("यूनिट TF-16: उपलब्ध");
    expect((await svc.handleCompany("919713257891", "स्थिति"))![0]).toContain("Woods Business Courtyard: कुल 1 यूनिट");
    expect(await svc.handleCompany("919000000000", "स्थिति")).toBeNull();
    vi.unstubAllEnvs();
  });
});
