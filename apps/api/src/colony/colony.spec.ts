import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FLORA_CITY_DEFAULTS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xlsx } from "../common/xlsx.js";
import { decrypt } from "../whatsapp/pii-crypto.js";
import {
  boundaryBlock,
  fillTemplate,
  missingMarkers,
  parseCompanySale,
  parsePlotRef,
  parsePlots,
  paymentBlock,
  plotBlock,
  readTable,
  saleChecks,
  suggestTemplate,
} from "./colony-rules.js";
import { ColonyService } from "./colony.service.js";

const OLD_FLORA = `विक्रय पत्र

विक्रेता पक्ष - {{PARTNER}}

क्रेता पक्ष - श्री पुराना ग्राहक पुत्र श्री पुराने पिता (आधार नं. 2345 6789 0123)

यह कि विक्रेता फर्म की ग्राम डोंगरपुर स्थित कॉलोनी FLORA CITY का विक्रीत प्लाट -
ब्लॉक - A
प्लाट क्रमांक - 12
क्षेत्रफल - 30 फुट x 40 फुट होकर 1200 वर्गफुट यानी 111.48 वर्गमीटर है
जिसकी चतुःसीमा निम्न प्रकार है -
पूर्व - प्लाट 13
पश्चिम - प्लाट 11
उत्तर - 30 फुट रोड
दक्षिण - प्लाट 20

उक्त प्लाट का प्रतिफल रु. 900000 विक्रेता ने चैक द्वारा प्राप्त कर लिया है।
अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।

कॉलोनी के रखरखाव की शर्तें लागू रहेंगी।
इति ग्वालियर, दिनांक 01.01.2026`;

describe("colony rules", () => {
  it("suggests the template from an old project deed (4 blocks marked, standard text kept)", () => {
    const s = suggestTemplate(OLD_FLORA);
    expect(s.found.sort()).toEqual(["{{BOUNDARY}}", "{{BUYER}}", "{{PAYMENT}}", "{{PLOT}}"]);
    expect(missingMarkers(s.template)).toEqual([]);
    expect(s.template).not.toContain("पुराना ग्राहक");
    expect(s.template).not.toContain("2345");
    expect(s.template).not.toContain("प्लाट 13");
    expect(s.template).toContain("यह कि विक्रेता फर्म की ग्राम डोंगरपुर स्थित कॉलोनी FLORA CITY");
    expect(s.template).toContain("कॉलोनी के रखरखाव की शर्तें लागू रहेंगी।");
    expect(s.template).toContain("इति ग्वालियर, दिनांक ____");
    expect(missingMarkers("कुछ {{BUYER}}")).toEqual(["{{PLOT}}", "{{BOUNDARY}}", "{{PAYMENT}}"]);
  });

  it("the 4 blocks in the office format", () => {
    expect(plotBlock({ block: "E", plotNo: "47", ewFt: 30, nsFt: 50, areaSqft: 1500 })).toBe(
      "ब्लॉक - E\nप्लाट क्रमांक - 47\nक्षेत्रफल - 30 फुट x 50 फुट होकर 1500 वर्गफुट यानी 139.35 वर्गमीटर है",
    );
    expect(boundaryBlock({ east: "प्लाट 48", west: null, north: "रोड", south: "प्लाट 60" })).toContain("पश्चिम - ____");
    const pay = paymentBlock(1500000, [
      { date: "2026-10-01", amount: 500000, mode: "cheque", ref: "चैक 1234 SBI" },
      { date: "2026-10-05", amount: 1000000, mode: "rtgs", ref: "" },
    ]);
    expect(pay).toContain("रूपये 15,00,000/- (पंद्रह लाख रूपये)");
    expect(pay).toContain("1. दिनांक 01.10.2026 को रूपये 5,00,000/- चैक (चैक 1234 SBI) द्वारा");
    expect(fillTemplate("{{PARTNER}} | {{PLOT}} | {{X}}", { PARTNER: "P", PLOT: "Q" })).toBe("P | Q | {{X}}");
  });

  it("checks: payment total, cash ≥ ₹2 lakh, area mismatch, below guideline, SAMPADA fields, double sale", () => {
    const buyer = { name: "श्याम", relation: "पुत्र" as const, guardian: "मोहन", motherName: "", address: "", mobile: "", email: "", aadhaar: "", pan: "" };
    const codes = saleChecks({
      consideration: 1_000_000,
      instalments: [{ date: "2026-10-01", amount: 300_000, mode: "cash", ref: "" }],
      buyers: [buyer],
      plot: { areaSqft: 1500, ewFt: 30, nsFt: 40 },
      guideline: { value: 1_393_545, how: "गाइडलाइन" },
      otherSaleOfPlot: true,
      plotSold: false,
    }).map((c) => `${c.level}:${c.code}`);
    expect(codes).toEqual(["error:doubleSale", "error:paymentTotal", "warning:cashLimit", "warning:areaMismatch", "warning:belowGuideline", "warning:sampadaFields"]);
    const ok = saleChecks({
      consideration: 1_500_000,
      instalments: [{ date: "2026-10-01", amount: 1_500_000, mode: "rtgs", ref: "" }],
      buyers: [{ ...buyer, motherName: "सीता", address: "लश्कर", mobile: "9876543210", email: "a@b.in", aadhaar: "x" }],
      plot: { areaSqft: 1500, ewFt: 30, nsFt: 50 },
      guideline: { value: 1_393_545, how: "गाइडलाइन" },
      otherSaleOfPlot: false,
      plotSold: false,
    });
    expect(ok).toEqual([]);
  });

  it("plot master from CSV and XLSX", () => {
    const csv = Buffer.from("ब्लॉक,प्लाट क्रमांक,पूर्व-पश्चिम (फुट),उत्तर-दक्षिण (फुट),क्षेत्रफल,पूर्व,पश्चिम,उत्तर,दक्षिण\ne,47,30,50,1500,प्लाट 48,प्लाट 46,\"30 फुट रोड, कॉलोनी\",प्लाट 60\nE,47,1,1,1,,,,\n,5,,,,,,,\n");
    const p = parsePlots(readTable(csv, "plots.csv"));
    expect(p.plots).toEqual([
      { row: 2, block: "E", plotNo: "47", ewFt: 30, nsFt: 50, areaSqft: 1500, east: "प्लाट 48", west: "प्लाट 46", north: "30 फुट रोड, कॉलोनी", south: "प्लाट 60", corner: false, floor: null },
    ]);
    expect(p.errors.map((e) => e.row)).toEqual([3, 4]);
    const book = xlsx([{ name: "प्लाट", rows: [["ब्लॉक", "प्लाट क्रमांक", "क्षेत्रफल", "पूर्व"], ["F", 7, 1200, "रोड"]] }]);
    expect(parsePlots(readTable(book, "plots.xlsx")).plots[0]).toMatchObject({ block: "F", plotNo: "7", areaSqft: 1200, east: "रोड" });
    expect(parsePlots([["नाम"]]).errors[0]!.reason).toContain("ब्लॉक");
  });

  it("company WhatsApp text", () => {
    expect(parsePlotRef("E-47")).toEqual({ block: "E", plotNo: "47" });
    expect(parsePlotRef("ब्लॉक e प्लाट ४७")).toEqual({ block: "E", plotNo: "47" });
    expect(parseCompanySale("बिक्री E-47\nक्रेता: श्याम सुंदर पुत्र श्री मोहन लाल\nपता: लश्कर\nमोबाइल: 98765 43210\nराशि: 15 लाख\nभागीदार: महेश")).toEqual({
      plot: { block: "E", plotNo: "47" },
      buyer: { name: "श्याम सुंदर", relation: "पुत्र", guardian: "मोहन लाल" },
      address: "लश्कर",
      mobile: "9876543210",
      amount: 1_500_000,
      partner: "महेश",
    });
    expect(parseCompanySale("नमस्ते")).toBeNull();
  });
});

/** In-memory Prisma for the service. */
function fakePrisma() {
  const t: Record<string, any[]> = {};
  let seq = 0;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      const x = row[k];
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("not" in v) return x !== v.not;
        if ("in" in v) return v.in.includes(x);
        return true;
      }
      return x === v;
    });
  const model = (name: string, defaults: () => any = () => ({})) => {
    const rows = (t[name] ??= []);
    return {
      findMany: async (a: any = {}) => rows.filter((r) => match(r, a.where)),
      findFirst: async (a: any = {}) => {
        const hit = rows.filter((r) => match(r, a.where));
        if (a.orderBy?.number === "desc") hit.sort((x, y) => y.number - x.number);
        return hit[0] ?? null;
      },
      count: async (a: any = {}) => rows.filter((r) => match(r, a.where)).length,
      create: async (a: any) => {
        const row = { id: `${name}-${++seq}`, createdAt: new Date(), ...defaults(), ...a.data };
        rows.push(row);
        return row;
      },
      update: async (a: any) => Object.assign(rows.find((r) => match(r, a.where)), a.data),
    };
  };
  return {
    t,
    colonyProject: model("colonyProject", () => ({ live: false })),
    colonyPlot: model("colonyPlot", () => ({ status: "AVAILABLE" })),
    colonySale: model("colonySale", () => ({ status: "DRAFT", deedId: null, source: "web" })),
    deedTemplate: model("deedTemplate"),
  } as any;
}

describe("ColonyService", () => {
  const ORG = "org-1";
  let prisma: any;
  const user = { id: "u1", email: "o@x", role: "ADMIN" as const, name: "Owner" };
  const svc = (role = "OWNER") => new ColonyService(prisma, { get: () => ({ userId: "u1", organizationId: ORG, membershipId: "m", role }) } as any);
  const ready = () => ({
    ...FLORA_CITY_DEFAULTS,
    partners: [
      { key: "mahesh", label: "महेश", text: "मेसर्स ग्रीन इन्फ्राटेक द्वारा भागीदार श्री महेश गुप्ता पुत्र श्री रमेश गुप्ता" },
      { key: "rohit", label: "रोहित", text: "मेसर्स ग्रीन इन्फ्राटेक द्वारा भागीदार श्री रोहित जैन पुत्र श्री सुरेश जैन" },
    ],
    devPermissions: ["टी.एन.सी.पी. अनुमति क्र. 123/2024", "कॉलोनी विकास अनुमति क्र. 45/2024"],
    maintenanceClauses: ["रखरखाव शर्त 1", "रखरखाव शर्त 2"],
    guidelineRatePerSqm: 8000,
    template: suggestTemplate(OLD_FLORA).template + "\n{{DEV_PERMISSION}}\n{{MAINTENANCE}}",
    companyNumbers: ["9111111111"],
  });
  const sale = (plotId: string, patch: any = {}) => ({
    plotId,
    partnerKey: "mahesh",
    consideration: 1_500_000,
    instalments: [{ date: "2026-10-01", amount: 1_500_000, mode: "rtgs" as const, ref: "UTR 99" }],
    buyers: [{ name: "श्याम सुंदर", relation: "पुत्र" as const, guardian: "मोहन लाल", motherName: "सीता", address: "लश्कर", mobile: "9876543210", email: "s@x.in", aadhaar: "2345 6789 0123", pan: "ABCDE1234F" }],
    ...patch,
  });

  beforeEach(() => {
    vi.stubEnv("DATA_ENC_KEY", "c".repeat(64));
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    prisma = fakePrisma();
  });
  afterEach(() => vi.unstubAllEnvs());

  async function project() {
    const p = await svc().create(ready());
    await svc().importPlots(p.id, { buffer: Buffer.from("ब्लॉक,प्लाट क्रमांक,पूर्व-पश्चिम,उत्तर-दक्षिण,क्षेत्रफल,पूर्व,पश्चिम,उत्तर,दक्षिण\nE,47,30,50,1500,प्लाट 48,प्लाट 46,30 फुट रोड,प्लाट 60\nE,48,30,50,1500,,,,\n"), originalname: "p.csv" });
    return p;
  }

  it("FLORA CITY: setup is OWNER/ADMIN, live is OWNER only and needs a complete project", async () => {
    await expect(svc("EMPLOYEE").create(ready())).rejects.toBeInstanceOf(ForbiddenException);
    const draft = await svc().create({ ...FLORA_CITY_DEFAULTS, name: "FLORA CITY (खाली)" });
    expect(draft.readiness.length).toBeGreaterThanOrEqual(4);
    await expect(svc().setLive(draft.id, true)).rejects.toBeInstanceOf(BadRequestException);
    const p = await project();
    expect((await svc().projects()).find((x) => x.id === p.id)!.readiness).toEqual([]);
    await expect(svc("ADMIN").setLive(p.id, true)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await svc().setLive(p.id, true)).live).toBe(true);
  });

  it("sale → deed: only the 4 blocks change; Aadhaar filled from the encrypted store; no double sale", async () => {
    const p = await project();
    const plot = prisma.t.colonyPlot.find((x: any) => x.plotNo === "47");
    const s = await svc("EMPLOYEE").createSale(p.id, sale(plot.id));
    expect(s.checks.map((c) => c.code)).toEqual(["notLive"]);
    expect(s.buyers[0]!.aadhaarMasked).toMatch(/0123$/);
    expect(JSON.stringify(prisma.t.colonySale[0].buyers)).not.toContain("234567890123");
    expect(decrypt(prisma.t.colonySale[0].buyers[0].aadhaar)).toBe("234567890123");
    await expect(svc("EMPLOYEE").createSale(p.id, sale(plot.id))).rejects.toThrow(/पहले ही बिक/);
    await expect(svc().createDeed(p.id, s.id, user)).rejects.toThrow(/लाइव/);
    await svc().setLive(p.id, true);
    const done = await svc("EMPLOYEE").createDeed(p.id, s.id, user);
    expect(done.status).toBe("DEED_CREATED");
    const deed = prisma.t.deedTemplate[0];
    expect(deed.title).toBe("विक्रय पत्र — FLORA CITY ब्लॉक E प्लाट 47 — श्याम सुंदर");
    expect(deed.content).toContain("क्रेता पक्ष - श्री श्याम सुंदर पुत्र श्री मोहन लाल (आधार नं. 2345 6789 0123) (पेन नं. ABCDE1234F)");
    expect(deed.content).toContain("ब्लॉक - E\nप्लाट क्रमांक - 47");
    expect(deed.content).toContain("पूर्व - प्लाट 48");
    expect(deed.content).toContain("UTR 99");
    expect(deed.content).toContain("भागीदार श्री महेश गुप्ता");
    expect(deed.content).toContain("टी.एन.सी.पी. अनुमति क्र. 123/2024");
    expect(deed.content).toContain("यह कि विक्रेता फर्म की ग्राम डोंगरपुर स्थित कॉलोनी FLORA CITY");
    expect(deed.content).not.toMatch(/\{\{|पुराना ग्राहक|प्लाट 13/);
    expect(plot.status).toBe("SOLD");
  });

  it("a sale with an error check cannot become a deed", async () => {
    const p = await project();
    await svc().setLive(p.id, true);
    const plot = prisma.t.colonyPlot.find((x: any) => x.plotNo === "48");
    const s = await svc().createSale(p.id, sale(plot.id, { consideration: 2_000_000 }));
    expect(s.checks.find((c) => c.code === "paymentTotal")?.level).toBe("error");
    await expect(svc().createDeed(p.id, s.id, user)).rejects.toThrow(/किश्तों का जोड़/);
  });

  it("company mode on WhatsApp: status, plot, sale draft (no Aadhaar over chat)", async () => {
    const p = await project();
    const s = svc();
    expect(await s.handleCompany("919000000000", "E-47")).toBeNull();
    expect((await s.handleCompany("919111111111", "स्थिति"))![0]).toBe("FLORA CITY: कुल 2 प्लाट — उपलब्ध 2, ड्राफ्ट 0, बिके 0।");
    expect((await s.handleCompany("919111111111", "E-47"))![0]).toContain("उपलब्ध");
    const r = await s.handleCompany("919111111111", "बिक्री E-47\nक्रेता: श्याम पुत्र श्री मोहन\nराशि: 15 लाख\nभागीदार: रोहित");
    expect(r![0]).toContain("बिक्री #1 दर्ज (ड्राफ्ट)");
    expect(prisma.t.colonySale[0]).toMatchObject({ source: "whatsapp", partnerKey: "rohit", consideration: 1_500_000 });
    expect((await s.handleCompany("919111111111", "बिक्री E-47\nक्रेता: राम पुत्र श्री श्याम\nराशि: 10 लाख"))![0]).toContain("दोबारा बिक्री नहीं");
    const list = await s.sales(p.id);
    expect(list[0]!.checks.map((c) => c.code)).toEqual(expect.arrayContaining(["paymentTotal", "sampadaFields"]));
  });

  it("Excel sales import", async () => {
    const p = await project();
    const book = xlsx([{ name: "बिक्री", rows: [["ब्लॉक", "प्लाट", "क्रेता", "संबंध", "पिता/पति", "राशि", "भुगतान दिनांक", "माध्यम", "भागीदार"], ["E", "48", "गीता", "पत्नी", "हरि", 1200000, "05/10/2026", "चैक", "रोहित"], ["Z", "1", "x", "", "", 1, "", "", ""]] }]);
    const r = await svc().importSales(p.id, { buffer: book, originalname: "s.xlsx" });
    expect(r.added).toBe(1);
    expect(r.errors[0]!.row).toBe(3);
    expect(prisma.t.colonySale[0]).toMatchObject({ source: "excel", partnerKey: "rohit", consideration: 1_200_000 });
    expect(prisma.t.colonySale[0].instalments[0]).toEqual({ date: "2026-10-05", amount: 1_200_000, mode: "cheque", ref: "" });
    expect(prisma.t.colonySale[0].buyers[0]).toMatchObject({ name: "गीता", relation: "पत्नी", guardian: "हरि" });
  });
});
