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
import { WhatsappService } from "../whatsapp/whatsapp.service.js";

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
    membership: {
      findFirst: async () => ({ id: "m-owner", userId: "u-owner", organizationId: "org-1", role: "OWNER", user: { id: "u-owner", fname: "Anuj", lname: "Sharma" } }),
    },
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

  describe("company paper on WhatsApp → deed by itself", () => {
    const PAPER = {
      project: "Flora City",
      plot: { block: "E", plotNo: "47" },
      buyers: [{ name: "श्याम सुंदर", relation: "पुत्र", guardian: "मोहन लाल", motherName: "सीता", address: "लश्कर", mobile: "9876543210", email: "s@x.in", aadhaar: "2345 6789 0123", pan: "ABCDE1234F" }],
      consideration: 1_500_000,
      instalments: [{ date: "2026-10-01", amount: 1_500_000, mode: "rtgs", ref: "UTR 99" }],
      partner: "महेश",
    };
    const FILE = { buf: Buffer.from("paper"), mime: "image/jpeg" };
    const cls = { get: () => undefined, set: vi.fn(), run: (fn: () => any) => fn() };
    const withPaper = (raw: any) => new ColonyService(prisma, cls as any, { extract: vi.fn(async () => raw) } as any);
    beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "k"));

    it("a complete paper: sale entered, deed made in the owner's name, plot sold, owner told", async () => {
      const p = await project();
      await svc().setLive(p.id, true);
      const logs: string[] = [];
      const s = withPaper(PAPER);
      (s as any).log = { log: (m: string) => logs.push(m), warn: () => undefined, error: () => undefined };
      expect(await s.isCompanyNumber("919111111111")).toBe(true);
      expect(await s.isCompanyNumber("919000000000")).toBe(false);
      const r = await s.handleCompanyFile("919111111111", [FILE], "");
      expect(r!.replies[0]).toContain("✅ FLORA CITY — बिक्री #1: ब्लॉक E - प्लाट 47, क्रेता श्याम सुंदर, राशि ₹15,00,000");
      expect(r!.replies[0]).toContain("डीड बन गई");
      expect(r!.ownerAlert).toContain("कंपनी के कागज़ से डीड बनी — बिक्री #1, ब्लॉक E - प्लाट 47");
      expect(prisma.t.colonySale[0]).toMatchObject({ status: "DEED_CREATED", source: "whatsapp", partnerKey: "mahesh" });
      expect(prisma.t.colonyPlot.find((x: any) => x.plotNo === "47").status).toBe("SOLD");
      const deed = prisma.t.deedTemplate[0];
      expect(deed.createdByName).toBe("WhatsApp कंपनी (Anuj Sharma)");
      expect(deed.content).toContain("श्याम सुंदर");
      expect(deed.content).toContain("UTR 99");
      // The owner: mother's name and mobile are never printed in the deed (kept only for Sampada).
      expect(deed.content).not.toContain("सीता");
      expect(deed.content).not.toContain("माता");
      expect(deed.content).not.toContain("9876543210");
      expect(cls.set).toHaveBeenCalledWith("tenant", expect.objectContaining({ organizationId: ORG, role: "OWNER" }));
      // Aadhaar stored encrypted, never in a log.
      expect(prisma.t.colonySale[0].buyers[0].aadhaar).toMatch(/^enc:/);
      expect(logs.join("\n")).not.toMatch(/234567890123|श्याम|9876543210|9111111111/);
      // The same paper again: the deed is already made.
      expect((await s.handleCompanyFile("919111111111", [FILE], ""))!.replies[0]).toContain("की डीड पहले ही बन चुकी है");
    });

    it("something missing → draft with the list; the full paper sent again updates the same sale and makes the deed", async () => {
      const p = await project();
      await svc().setLive(p.id, true);
      const half = await withPaper({ ...PAPER, buyers: [{ ...PAPER.buyers[0], aadhaar: null }], instalments: [] }).handleCompanyFile("919111111111", [FILE], "");
      expect(half!.replies[0]).toContain("ड्राफ्ट दर्ज");
      expect(half!.replies[0]).toContain("• क्रेता का आधार");
      expect(half!.replies[0]).toContain("• भुगतान की किश्तें");
      expect(half!.ownerAlert).toBeNull();
      expect(prisma.t.colonyPlot.find((x: any) => x.plotNo === "47").status).toBe("DRAFTED");
      const full = await withPaper(PAPER).handleCompanyFile("919111111111", [FILE], "");
      expect(full!.replies[0]).toContain("बिक्री #1");
      expect(full!.replies[0]).toContain("डीड बन गई");
      expect(prisma.t.colonySale).toHaveLength(1);
    });

    it("pages sent apart: the payment page fills in the details page's draft, never wipes it", async () => {
      const p = await project();
      await svc().setLive(p.id, true);
      const s1 = await withPaper({ ...PAPER, instalments: [], consideration: null }).handleCompanyFile("919111111111", [FILE], "");
      expect(s1!.replies[0]).toContain("ड्राफ्ट दर्ज");
      const s2 = await withPaper({ plot: PAPER.plot, buyers: [], consideration: 1_500_000, instalments: PAPER.instalments, partner: null }).handleCompanyFile("919111111111", [FILE], "");
      expect(s2!.replies[0]).toContain("डीड बन गई");
      expect(s2!.replies[0]).toContain("क्रेता श्याम सुंदर");
      expect(prisma.t.deedTemplate[0].content).toContain("श्याम सुंदर");
    });

    it("the owner's 'कंपनी मोड': any project, 30 minutes, ended by 'ओनर मोड'", async () => {
      const p = await project();
      await svc().setLive(p.id, true);
      const s = withPaper(PAPER);
      const OWNER = "919999900000";
      expect(await s.isCompanyNumber(OWNER)).toBe(false);
      expect(s.startOwnerCompanyMode(OWNER)[0]).toContain("कंपनी मोड 30 मिनट");
      expect(await s.isCompanyNumber(OWNER)).toBe(true);
      expect((await s.handleCompanyFile(OWNER, [FILE, FILE], ""))!.replies[0]).toContain("डीड बन गई");
      expect(s.inOwnerCompanyMode(OWNER, Date.now() + 31 * 60_000)).toBe(false);
      s.startOwnerCompanyMode(OWNER);
      expect(s.endOwnerCompanyMode(OWNER)).toBe(true);
      expect(await s.handleCompanyFile(OWNER, [FILE], "")).toBeNull();
    });

    describe("the 10:33 AM conversation, replayed through the webhook", () => {
      const OWNER = "919999900000";
      async function phone(colony: ColonyService) {
        vi.stubEnv("WA_ACCESS_TOKEN", "t");
        vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
        vi.stubEnv("WA_PAPER_WAIT_MS", "15000");
        vi.stubEnv("WA_MEDIA_DIR", await import("node:fs/promises").then((f) => f.mkdtemp(`${(process.env.TMPDIR ?? "/tmp").replace(/\/$/, "")}/wa-e2e-`)));
        for (const k of ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) vi.stubEnv(k, "");
        const sent: string[] = [];
        vi.stubGlobal(
          "fetch",
          vi.fn(async (u: string, init?: any) => {
            const url = String(u);
            if (/\/img\d$/.test(url)) return new Response(JSON.stringify({ url: `https://media.example/${url.split("/").pop()}`, mime_type: "image/jpeg" }), { status: 200 });
            if (url.startsWith("https://media.example/")) return new Response(Buffer.from("jpg"), { status: 200 });
            const b = JSON.parse(init.body);
            if (b.type === "text") sent.push(b.text.body);
            return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
          }),
        );
        const owner: any = {
          isOwner: (p: string) => p === OWNER,
          inCustomerTest: async () => false,
          endCustomerTest: async () => ["✅ ओनर मोड चालू।"],
          handle: vi.fn(async () => ["TASK"]),
          handleFile: vi.fn(async () => ["TASK-FILE"]),
        };
        const outbox: any = { touchContact: async () => undefined, alertOwners: vi.fn(async () => 1), inWindow: async () => true };
        const wa = new WhatsappService(
          { waInboundMessage: { create: vi.fn(async () => ({})) } } as any,
          { hasActive: async () => false, handleText: async () => null } as any,
          outbox,
          { handleReply: async () => null, flushPending: async () => undefined } as any,
          { allowInbound: async () => true, withoutRepeats: async (_p: string, r: string[]) => r } as any,
          owner,
          { ownerText: async () => null, ownerButton: async () => null, handle: async () => null } as any,
          colony,
        );
        let n = 0;
        const msg = (m: any) => wa.handlePayload({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { contacts: [{ profile: { name: "A" } }], messages: [{ id: `m${++n}`, from: OWNER, ...m }] } }] }] });
        return {
          sent,
          owner,
          outbox,
          text: (body: string) => msg({ type: "text", text: { body } }),
          image: (i: number) => msg({ type: "image", image: { id: `img${i}`, mime_type: "image/jpeg" } }),
          hd: () => msg({ type: "unsupported" }),
        };
      }
      afterEach(() => vi.unstubAllGlobals());

      it("कंपनी मोड → photo + HD photo → 'Sab bhej diya' → deed; 'Deed bana do' / 'Haan' never tasks", async () => {
        const p = await project();
        await svc().setLive(p.id, true);
        const E20 = { ...PAPER, plot: { block: "E", plotNo: "47" } };
        const colony = withPaper(E20);
        const w = await phone(colony);
        await w.text("कंपनी मोड");
        expect(w.sent.at(-1)).toContain("कंपनी मोड 30 मिनट");
        await w.image(1);
        expect(w.sent.at(-1)).toContain("कागज़ मिला — पढ़ रहा हूँ");
        await w.hd();
        expect(w.sent.at(-1)).toContain("HD नहीं");
        await w.text("Sab bhej diya");
        expect(w.sent.at(-1)).toContain("डीड बन गई");
        expect(w.outbox.alertOwners).toHaveBeenCalledWith(expect.stringContaining("कंपनी के कागज़ से डीड बनी"));
        await w.text("Deed bana do");
        expect(w.sent.at(-1)).toContain("की डीड बन चुकी है ✅");
        await w.text("Haan");
        expect(w.sent.at(-1)).not.toBe("TASK");
        expect(w.owner.handle).not.toHaveBeenCalled();
        expect(w.owner.handleFile).not.toHaveBeenCalled();
        await w.text("ओनर मोड");
        await w.text("Purana delete kar do sab");
        expect(w.owner.handle).toHaveBeenCalledTimes(1);
      });

      it("'फ्लोर की डिड बनानी है न्यू' turns company mode on by itself", async () => {
        const p = await project();
        await svc().setLive(p.id, true);
        await svc().update(p.id, { ...ready(), aliases: "फ़्लोरा सिटी, Flora" } as any).catch(() => undefined);
        const w = await phone(withPaper(PAPER));
        await w.text("फ्लोर की डिड बनानी है न्यू");
        expect(w.sent.at(-1)).toContain("की डीड — कागज़ के सारे पन्ने");
        expect(w.owner.handle).not.toHaveBeenCalled();
        await w.text("कल रमेश की रजिस्ट्री है");
        expect(w.sent.at(-1)).toContain("कंपनी मोड:");
      });

      it("a draft entered on the web is filled by the paper; a made deed tells which sale to cancel", async () => {
        const p = await project();
        await svc().setLive(p.id, true);
        const plot = prisma.t.colonyPlot.find((x: any) => x.plotNo === "47");
        await svc().createSale(p.id, sale(plot.id, { instalments: [{ date: "2026-10-01", amount: 100, mode: "cash", ref: "" }] }));
        const r = await withPaper(PAPER).handleCompanyFile("919111111111", [FILE], "");
        expect(r!.replies[0]).toContain("बिक्री #1");
        expect(r!.replies[0]).toContain("डीड बन गई");
        const again = await withPaper(PAPER).handleCompanyFile("919111111111", [FILE], "");
        expect(again!.replies[0]).toContain("बिक्री #1 की डीड पहले ही बन चुकी है");
        expect(again!.replies[0]).toContain('"रद्द" करें');
      });
    });

    it("not live → draft only; unknown plot / unreadable paper / other numbers explained", async () => {
      await project();
      const r = await withPaper(PAPER).handleCompanyFile("919111111111", [FILE], "");
      expect(r!.replies[0]).toContain("प्रोजेक्ट अभी लाइव नहीं है");
      expect(prisma.t.deedTemplate).toHaveLength(0);
      expect((await withPaper({ ...PAPER, plot: { block: "Z", plotNo: "9" } }).handleCompanyFile("919111111111", [FILE], ""))!.replies[0]).toContain("ब्लॉक Z - प्लाट 9 प्लाट मास्टर में नहीं");
      expect((await withPaper(null).handleCompanyFile("919111111111", [FILE], ""))!.replies[0]).toContain("कागज़ पढ़ा नहीं जा सका");
      expect(await withPaper(PAPER).handleCompanyFile("919000000000", [FILE], "")).toBeNull();
    });
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
