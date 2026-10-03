import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../whatsapp/pii-crypto.js";
import { aiPropertyTypeOf, classifyPropertyType, leakCount, locationScore, maskArchive, pickExamples, placeOf } from "./archive-text.js";
import { AiDraftService, factsShown, parseReview, syntheticInput, targetPlace } from "./ai-draft.service.js";
import { readStream } from "./claude.js";
import { costUsd, substituteTokens, validateDraft } from "./draft-rules.js";

const ORG = "org-1";
const OLD_AADHAAR = "4567 8901 2345";
const OLD_DEED = `विक्रय पत्र

विक्रेता पक्ष - श्री रामलाल शर्मा पुत्र श्री किशनलाल शर्मा (आधार नं. ${OLD_AADHAAR}) निवासी लश्कर ग्वालियर, मोबाइल 9876501234
क्रेता पक्ष - श्रीमती सीता देवी पत्नी श्री मोहन गुप्ता (आधार नं. 5678 1234 9012) (पेन नं. ABCDE1234F)

विक्रीत सम्पत्ति का विवरण -
प्लाट क्रमांक - 47, सालूपुरा कॉलोनी, वार्ड क्रमांक 66, तहसील ग्वालियर, जिला ग्वालियर
क्षेत्रफल - 30 फुट x 50 फुट होकर 1500 वर्गफुट यानी 139.35 वर्गमीटर है
जिसकी चतुःसीमा निम्न प्रकार है -
पूर्व - मकान श्री हरिप्रसाद का
पश्चिम - रोड

प्रतिफल राशि रु. 1500000 अक्षरी पंद्रह लाख रुपये प्राप्त कर लिये हैं। अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।

इति ग्वालियर, दिनांक 01.02.2026`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("archive text", () => {
  it("property type: plot / building / agricultural / flat (never mixed)", () => {
    expect(classifyPropertyType(OLD_DEED)).toBe("plot");
    expect(classifyPropertyType("सर्वे क्रमांक 12 रकबा 0.50 हेक्टेयर कृषि भूमि")).toBe("agricultural");
    expect(classifyPropertyType("प्लाट क्रमांक 5 पर निर्मित पक्का मकान")).toBe("building");
    expect(classifyPropertyType("फ्लैट नं. 202 दूसरी मंजिल")).toBe("flat");
    expect(classifyPropertyType("कोई विवरण नहीं")).toBeNull();
    expect(aiPropertyTypeOf("residential_plot")).toBe("plot");
    expect(aiPropertyTypeOf("house")).toBe("building");
    expect(aiPropertyTypeOf(null)).toBeNull();
  });

  it("place and location priority", () => {
    const p = placeOf(OLD_DEED);
    expect(p).toMatchObject({ ward: "66", tehsil: "ग्वालियर", district: "ग्वालियर" });
    expect(p.colony).toContain("सालूपुरा");
    const target = targetPlace({ locality: "वार्ड 66, सालूपुरा कॉलोनी", village: null, tehsil: "ग्वालियर", district: "ग्वालियर" });
    expect(target.ward).toBe("66");
    expect(locationScore(target, { ...p }).score).toBe(4);
    expect(locationScore(target, { colony: null, village: null, ward: "66", tehsil: null, district: null }).reason).toBe("वही वार्ड");
    expect(locationScore(target, { colony: null, village: null, ward: "1", tehsil: "ग्वालियर", district: null }).score).toBe(2);
    expect(locationScore(target, { colony: null, village: null, ward: null, tehsil: "डबरा", district: "ग्वालियर" }).score).toBe(1);
    const mk = (id: string, place: any, starred = false, days = 0) => ({ deedId: id, title: id, starred, updatedAt: new Date(Date.UTC(2026, 0, 1 + days)), colony: null, village: null, ward: null, tehsil: null, district: null, ...place });
    const picked = pickExamples(target, [mk("district", { district: "ग्वालियर" }, false, 9), mk("tehsil", { tehsil: "ग्वालियर" }), mk("ward", { ward: "66" }), mk("star", { district: "ग्वालियर" }, true)]);
    expect(picked.map((x) => x.deedId)).toEqual(["ward", "tehsil", "star"]);
  });

  it("masks old customers' data; the leak check counts only strong identifiers", () => {
    const m = maskArchive(OLD_DEED);
    for (const pii of [OLD_AADHAAR, "रामलाल शर्मा", "किशनलाल शर्मा", "सीता देवी", "ABCDE1234F", "9876501234", "1500000", "हरिप्रसाद"]) expect(m.text).not.toContain(pii);
    expect(m.text).toContain("श्री [नाम-1] पुत्र श्री [नाम-2]");
    expect(m.text).toContain("अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है");
    expect(m.text).toContain("प्लाट क्रमांक - [क्रमांक]");
    expect(leakCount("क्रेता श्री रामलाल शर्मा", m.originals, [])).toBe(1);
    expect(leakCount("क्रेता श्री रामलाल शर्मा", m.originals, ["रामलाल शर्मा"])).toBe(0); // same name in the new request
    expect(leakCount("तहसील ग्वालियर, जिला ग्वालियर", m.originals, [])).toBe(0);
  });
});

describe("draft rules", () => {
  const input = syntheticInput("sale-deed", "plot", { colony: "सालूपुरा कॉलोनी", village: null, ward: "66", tehsil: "ग्वालियर", district: "ग्वालियर" }, 0);
  const good = ["विक्रय पत्र", ...input.blocks, "प्रतिफल राशि 1201000 रुपये। अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।", "इति ग्वालियर, दिनांक ____"].join("\n\n");

  it("a complete draft passes; missing facts, copied masks and markdown are reported", () => {
    expect(validateDraft(good, input)).toEqual([]);
    const bad = validateDraft(good.replace("परीक्षण क्रेता 1", "कोई और").replace("इति", "") + "\n**श्री [नाम-1]**", input).map((i) => i.code);
    expect(bad).toEqual(expect.arrayContaining(["block", "fact", "clause", "copiedMask", "markdown"]));
  });

  it("tokens are replaced only on the server; staff see Aadhaar to the last 4", () => {
    expect(good).toContain("[[AADHAAR_1]]");
    const final = substituteTokens(good, input.tokens);
    expect(final).toContain("9999 0000 1001");
    expect(final).not.toContain("[[");
    const shown = factsShown(input, good);
    expect(shown.find((f) => f.label === "आधार")).toMatchObject({ value: "XXXX 1001", found: true, source: "पहचान पत्र" });
  });

  it("cost and review parsing", () => {
    expect(costUsd("claude-opus-5-5", 10_000, 4_000)).toBe(0.12);
    expect(parseReview('ये दिक्कतें: ["राशि शब्दों में नहीं"]')).toEqual(["राशि शब्दों में नहीं"]);
    expect(parseReview("ठीक है")).toEqual([]);
  });

  it("reads the streamed answer and usage", async () => {
    const sse = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_read_input_tokens":30}}}',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"विक्रय "}}',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"पत्र"}}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}',
      "",
    ].join("\n");
    const body = new Response(sse).body!;
    expect(await readStream(body)).toEqual({ text: "विक्रय पत्र", inputTokens: 150, outputTokens: 7, stopReason: "end_turn" });
  });
});

/** In-memory Prisma for the service. */
function fakePrisma() {
  const t: Record<string, any[]> = {};
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === "NOT") return !match(row, v);
      const x = row[k];
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v) return v.in.includes(x);
        if ("not" in v) return x !== v.not;
        return true;
      }
      return v === null ? x == null : x === v;
    });
  const model = (name: string) => {
    const rows = (t[name] ??= []);
    return {
      findMany: async (a: any = {}) => rows.filter((r) => match(r, a.where)).slice(0, a.take ?? 1e9),
      findFirst: async (a: any = {}) => rows.find((r) => match(r, a.where)) ?? null,
      findUnique: async (a: any) => rows.find((r) => match(r, a.where)) ?? null,
      create: async (a: any) => {
        const row = { id: `${name}-${rows.length + 1}`, createdAt: new Date(), startedAt: new Date(), ...a.data };
        rows.push(row);
        return row;
      },
      update: async (a: any) => Object.assign(rows.find((r) => match(r, a.where)), a.data),
      upsert: async (a: any) => {
        const row = rows.find((r) => match(r, a.where));
        if (row) return Object.assign(row, a.update);
        rows.push({ ...a.create });
        return a.create;
      },
    };
  };
  return {
    t,
    deedTemplate: model("deedTemplate"),
    deedArchiveIndex: model("deedArchiveIndex"),
    aiDraftConfig: model("aiDraftConfig"),
    aiDraftRun: model("aiDraftRun"),
    aiEvalRun: model("aiEvalRun"),
    draftIntake: model("draftIntake"),
  } as any;
}

describe("AiDraftService", () => {
  const NEW_AADHAAR = "234567890123";
  let prisma: any;
  let calls: { system: string; user: string }[];
  const user = { id: "u-owner", email: "o@x", role: "ADMIN" as const, name: "Owner" };

  function svc(role = "OWNER", userId = "u-owner") {
    const cls: any = { get: () => ({ userId, organizationId: ORG, membershipId: "m", role }), run: (fn: any) => fn(), set: () => undefined };
    const s = new AiDraftService(prisma, cls);
    s.call = vi.fn(async ({ system, user: u }: any) => {
      calls.push({ system, user: u });
      if (system.startsWith("You are a senior")) return { text: '["गवाहों का विवरण नहीं"]', inputTokens: 500, outputTokens: 20, stopReason: "end_turn" };
      const blocks = [...u.matchAll(/<block>\n([\s\S]*?)\n<\/block>/g)].map((m: RegExpMatchArray) => m[1]);
      const amount = u.match(/प्रतिफल राशि: (\d+)/)?.[1] ?? "____";
      return { text: ["विक्रय पत्र", ...blocks, `प्रतिफल राशि ${amount} रुपये। अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।`, "इति ग्वालियर, दिनांक ____"].join("\n\n"), inputTokens: 9000, outputTokens: 3000, stopReason: "end_turn" };
    });
    return s;
  }

  beforeEach(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("DATA_ENC_KEY", "c".repeat(64));
    prisma = fakePrisma();
    calls = [];
    for (let i = 0; i < 12; i++) {
      await prisma.deedTemplate.create({ data: { id: `old-${i}`, type: "sale-deed", title: `पुरानी ${i}`, content: OLD_DEED.replace("वार्ड क्रमांक 66", `वार्ड क्रमांक ${60 + i}`), status: "active", starterSourceId: null, aiDraftStatus: null, updatedAt: new Date(Date.UTC(2026, 0, 1 + i)) } });
    }
    await prisma.deedTemplate.create({ data: { id: "agri-1", type: "sale-deed", title: "कृषि", content: "सर्वे क्रमांक 9 कृषि भूमि हेक्टेयर", status: "active", starterSourceId: null, updatedAt: new Date() } });
    await prisma.draftIntake.create({
      data: {
        id: "cmreq00000xyz123",
        organizationId: ORG,
        phone: "919876543210",
        status: "SUBMITTED",
        workStatus: "IN_PROGRESS",
        step: "FINAL",
        assigneeId: "u-emp",
        needsStaff: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        data: { deedType: "sale", buyerName: "श्याम सुंदर", buyerRelation: "पुत्र", buyerFatherName: "मोहन लाल", buyerAadhaar: encrypt(NEW_AADHAAR), amount: 1800000, amountMode: "CUSTOM" },
        deed: {
          isSaleDeed: true,
          buyers: [{ name: "राधेश्याम", relation: "पुत्र श्री गोपाल" }],
          property: { district: "ग्वालियर", tehsil: "ग्वालियर", village: null, locality: "वार्ड 66, सालूपुरा कॉलोनी", khasraOrPlotNo: "52", propertyType: "residential_plot", areaValue: 1200, areaUnit: "वर्गफुट" },
        },
      },
    });
  });

  it("is OFF until the owner switches the type on, which needs a passing eval", async () => {
    const s = svc();
    expect((await s.availability("cmreq00000xyz123")).reason).toBe("typeOff");
    await expect(s.generate("cmreq00000xyz123", user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.toggle("plot", true)).rejects.toBeInstanceOf(BadRequestException);
    await prisma.aiEvalRun.create({ data: { organizationId: ORG, propertyType: "plot", status: "DONE", score: 0.9, total: 50, startedAt: new Date() } });
    await expect(s.toggle("plot", true)).rejects.toBeInstanceOf(BadRequestException);
    await prisma.aiEvalRun.create({ data: { organizationId: ORG, propertyType: "plot", status: "DONE", score: 0.96, total: 50, startedAt: new Date(Date.now() + 1000) } });
    prisma.t.aiEvalRun.reverse(); // newest first for the fake findFirst
    expect((await s.toggle("plot", true)).enabled.plot).toBe(true);
    await expect(svc("ADMIN").toggle("plot", false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("drafts from same-type deeds only, masked; Aadhaar as a token; saves REVIEW_PENDING with transparency", async () => {
    await prisma.aiDraftConfig.upsert({ where: { organizationId: ORG }, create: { organizationId: ORG, config: { enabled: { plot: true } } }, update: {} });
    const run = await svc("EMPLOYEE", "u-emp").generate("cmreq00000xyz123", user); // the assignee may
    expect(run.status).toBe("OK");
    expect(run.examples.map((e) => e.deedId)).toEqual(["old-6", "old-11", "old-10"]); // ward 66 first, then most recent
    expect(run.examples[0]!.reason).toContain("वार्ड");
    const prompt = calls[0]!.user;
    expect(prompt).not.toContain("agri");
    for (const pii of [OLD_AADHAAR, "रामलाल शर्मा", "सीता देवी", "9876501234", NEW_AADHAAR, "234567890123", "2345 6789 0123"]) expect(prompt).not.toContain(pii);
    expect(prompt).toContain("[[AADHAAR_1]]");
    expect(calls[1]!.user).not.toContain("2345 6789 0123"); // senior review sees tokens too
    const deed = prisma.t.deedTemplate.find((d: any) => d.id === run.deedId);
    expect(deed).toMatchObject({ type: "sale-deed", aiDraftStatus: "REVIEW_PENDING" });
    expect(deed.content).toContain("आधार नं. 2345 6789 0123");
    expect(deed.content).toContain("श्री श्याम सुंदर पुत्र श्री मोहन लाल");
    expect(prisma.t.draftIntake[0].deedTemplateId).toBe(run.deedId);
    expect(run.reviewIssues).toEqual(["गवाहों का विवरण नहीं"]);
    expect(run.facts.find((f) => f.label === "क्रेता का आधार")).toMatchObject({ value: "XXXX 0123", found: true });
    expect(run.facts.find((f) => f.label === "विक्रेता 1 का नाम")).toMatchObject({ value: "राधेश्याम", source: "पुरानी रजिस्ट्री (पढ़ी गई)" });
    expect(run.inputTokens).toBe(9500);
    expect(run.costUsd).toBeGreaterThan(0);
  });

  it("no deed of that type → no AI draft; a leak blocks the draft; others' requests are hidden", async () => {
    await prisma.aiDraftConfig.upsert({ where: { organizationId: ORG }, create: { organizationId: ORG, config: { enabled: { plot: true } } }, update: {} });
    prisma.t.deedTemplate.forEach((d: any) => (d.status = "inactive"));
    expect((await svc().generate("cmreq00000xyz123", user)).status).toBe("NO_EXAMPLES");
    prisma.t.deedTemplate.forEach((d: any) => (d.status = "active"));
    const s = svc();
    (s.call as any).mockImplementationOnce(async () => ({ text: "विक्रय पत्र\nश्री रामलाल शर्मा", inputTokens: 1, outputTokens: 1, stopReason: "end_turn" }));
    const blocked = await s.generate("cmreq00000xyz123", user);
    expect(blocked.status).toBe("BLOCKED_LEAK");
    expect(blocked.deedId).toBeNull();
    await expect(svc("EMPLOYEE", "u-other").generate("cmreq00000xyz123", user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("eval: synthetic parties, the target deed is never its own example, score recorded", async () => {
    const s = svc();
    const cands = (await (s as any).candidates(ORG, "sale-deed", "plot")) as any[];
    expect(cands).toHaveLength(12);
    await prisma.aiEvalRun.create({ data: { id: "ev1", organizationId: ORG, propertyType: "plot", deedType: "sale-deed", status: "RUNNING", total: 12 } });
    await s.runEval("ev1", ORG, "sale-deed", "plot", cands, cands);
    const ev = prisma.t.aiEvalRun[0];
    expect(ev).toMatchObject({ status: "DONE", passed: 12, score: 1, done: 12 });
    expect(calls).toHaveLength(12);
    expect(calls.every((c) => !c.user.includes("रामलाल") && c.user.includes("परीक्षण क्रेता"))).toBe(true);
  });
});
