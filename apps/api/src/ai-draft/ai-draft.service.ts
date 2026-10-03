import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Prisma } from "@prisma/client";
import { formatParty, formatPartyBlock, formatPropertyBlock } from "@sampada/shared";
import type {
  AiDraftAvailability,
  AiDraftRunItem,
  AiDraftSettings,
  AiEvalItem,
  AiFactShown,
  AiPropertyTypeT,
  DeedType,
} from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { TENANT_KEY, type TenantContext } from "../tenant/tenant-context.js";
import { type DraftIntakeRow, requestRef, revealSecrets, toDetail } from "../whatsapp/wa-requests.mapper.js";
import {
  AI_PROPERTY_TYPES,
  type AiPropertyType,
  aiPropertyTypeOf,
  type Candidate,
  classifyPropertyType,
  leakCount,
  maskArchive,
  pickExamples,
  type PlaceText,
  placeOf,
} from "./archive-text.js";
import { AI_DRAFT_MODEL, callClaude, type ClaudeResult } from "./claude.js";
import {
  buildPrompt,
  cleanOutput,
  costUsd,
  type DraftInput,
  draftInput,
  FACT_SOURCE_HI,
  type Issue,
  REQUEST_DEED_TYPE,
  substituteTokens,
  SYSTEM_PROMPT,
  validateDraft,
} from "./draft-rules.js";

const isManager = (role: string) => role === "OWNER" || role === "ADMIN";
const DEFAULT_THRESHOLD = 0.95;
const EVAL_SIZE = 50;
const EVAL_MIN = 10;
/** Issue codes that fail an eval case (style-only ones like "date" do not). */
const EVAL_FAIL = new Set(["title", "block", "fact", "clause", "agri", "token", "copiedMask", "markdown", "hindi", "leak"]);

const REVIEW_SYSTEM = `You are a senior deed reviewer at a document-writer office in Madhya Pradesh. You get FACTS and a DRAFT deed in Hindi.
List concrete problems only: a fact missing or changed, wrong party role, a clause that contradicts another, invented details (names, boundaries, amounts, dates not in FACTS), wrong deed structure.
Tokens like [[AADHAAR_1]] and blanks "____" are intentional, not problems.
Return ONLY a JSON array of at most 10 short Hindi strings, [] when the draft is fine.`;

type Config = { enabled: Record<AiPropertyType, boolean>; threshold: number };
const DEFAULT_CONFIG: Config = { enabled: { plot: false, building: false, agricultural: false, flat: false }, threshold: DEFAULT_THRESHOLD };

export type CallFn = (o: { system: string; user: string; maxTokens: number; effort?: "low" | "medium" | "high" }) => Promise<ClaudeResult>;

/**
 * "AI से पूरा ड्राफ्ट": retrieval only from this office's DeedTemplate archive
 * (same deed type, same property type -- never mixed), old customers' data
 * masked before the model, Aadhaar/PAN as tokens filled in on the server, a
 * leak check, the validator, a senior-review pass, and a run log (tokens /
 * cost, no personal data). Off per property type until the eval passes and
 * the owner switches it on.
 */
@Injectable()
export class AiDraftService {
  private readonly log = new Logger("AiDraft");
  /** Replaceable in tests. */
  call: CallFn = (o) => callClaude(o);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- settings ----------
  async config(organizationId: string): Promise<Config> {
    const row = await this.prisma.aiDraftConfig.findUnique({ where: { organizationId } });
    const c = (row?.config ?? {}) as Partial<Config>;
    return {
      enabled: { ...DEFAULT_CONFIG.enabled, ...(c.enabled ?? {}) },
      threshold: typeof c.threshold === "number" && c.threshold > 0 && c.threshold <= 1 ? c.threshold : DEFAULT_THRESHOLD,
    };
  }

  private async lastEval(organizationId: string, pt: AiPropertyType) {
    return this.prisma.aiEvalRun.findFirst({ where: { organizationId, propertyType: pt, status: "DONE" }, orderBy: { startedAt: "desc" } });
  }

  async settings(): Promise<AiDraftSettings> {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    const c = await this.config(t.organizationId);
    const lastEval = {} as AiDraftSettings["lastEval"];
    for (const pt of AI_PROPERTY_TYPES) {
      const e = await this.lastEval(t.organizationId, pt);
      lastEval[pt] = e && e.score != null ? { score: e.score, total: e.total, finishedAt: (e.finishedAt ?? e.startedAt).toISOString() } : null;
    }
    const stars = await this.prisma.deedArchiveIndex.findMany({ where: { organizationId: t.organizationId, starred: true } });
    const titles = stars.length
      ? await this.prisma.deedTemplate.findMany({ where: { id: { in: stars.map((s) => s.deedId) } }, select: { id: true, title: true } })
      : [];
    return {
      enabled: c.enabled,
      threshold: c.threshold,
      lastEval,
      starred: stars.map((s) => ({ deedId: s.deedId, title: titles.find((x) => x.id === s.deedId)?.title ?? "—", propertyType: s.propertyType })),
      model: AI_DRAFT_MODEL(),
      canManage: t.role === "OWNER",
    };
  }

  /** OWNER only. Switching on needs a finished eval of this type at or above the threshold. */
  async toggle(pt: AiPropertyType, enabled: boolean): Promise<AiDraftSettings> {
    const t = this.owner();
    const c = await this.config(t.organizationId);
    if (enabled) {
      const e = await this.lastEval(t.organizationId, pt);
      if (!e || e.score == null || e.score < c.threshold || e.total < EVAL_MIN) {
        throw new BadRequestException(`पहले इस प्रकार का eval चलाएँ — कम से कम ${EVAL_MIN} डीड पर ${Math.round(c.threshold * 100)}% पास होना ज़रूरी है।`);
      }
    }
    c.enabled[pt] = enabled;
    await this.prisma.aiDraftConfig.upsert({
      where: { organizationId: t.organizationId },
      create: { organizationId: t.organizationId, config: c as any },
      update: { config: c as any },
    });
    this.log.log(`AI draft ${pt}: ${enabled ? "on" : "off"}`);
    return this.settings();
  }

  /** OWNER: mark an archive deed "आदर्श" (preferred example). */
  async star(deedId: string, starred: boolean): Promise<AiDraftSettings> {
    const t = this.owner();
    const deed = await this.prisma.deedTemplate.findFirst({ where: { id: deedId }, select: { id: true, type: true, content: true, updatedAt: true } });
    if (!deed) throw new NotFoundException("डीड नहीं मिली।");
    await this.indexOne(t.organizationId, deed);
    await this.prisma.deedArchiveIndex.update({ where: { deedId }, data: { starred } });
    return this.settings();
  }

  private owner(): TenantContext {
    const t = requireTenantContext(this.cls);
    if (t.role !== "OWNER") throw new ForbiddenException("यह सेटिंग केवल मालिक बदल सकते हैं।");
    return t;
  }

  // ---------- archive index ----------
  private async indexOne(organizationId: string, d: { id: string; type: string; content: string }) {
    const place = placeOf(d.content);
    const data = { organizationId, deedType: d.type, propertyType: classifyPropertyType(d.content), ...place, indexedAt: new Date() };
    await this.prisma.deedArchiveIndex.upsert({ where: { deedId: d.id }, create: { deedId: d.id, ...data }, update: data });
  }

  /** Indexes this org's deeds of `type` that are new or changed since they were last read. */
  async ensureIndex(organizationId: string, type: DeedType): Promise<void> {
    const deeds = await this.prisma.deedTemplate.findMany({ where: { type, status: "active" }, select: { id: true, updatedAt: true } });
    const idx = await this.prisma.deedArchiveIndex.findMany({ where: { organizationId, deedType: type }, select: { deedId: true, indexedAt: true } });
    const at = new Map(idx.map((i) => [i.deedId, i.indexedAt]));
    const stale = deeds.filter((d) => !at.has(d.id) || at.get(d.id)! < d.updatedAt).map((d) => d.id);
    for (let i = 0; i < stale.length; i += 100) {
      const rows = await this.prisma.deedTemplate.findMany({ where: { id: { in: stale.slice(i, i + 100) } }, select: { id: true, type: true, content: true } });
      for (const r of rows) await this.indexOne(organizationId, r);
    }
    if (stale.length) this.log.log(`archive index: ${stale.length} ${type} deed(s) read`);
  }

  /** Same deed type + property type only; hand-made deeds (no unreviewed AI drafts, no starter copies). */
  private async candidates(organizationId: string, type: DeedType, pt: AiPropertyType, excludeId?: string): Promise<Candidate[]> {
    await this.ensureIndex(organizationId, type);
    const idx = await this.prisma.deedArchiveIndex.findMany({ where: { organizationId, deedType: type, propertyType: pt } });
    if (!idx.length) return [];
    const deeds = await this.prisma.deedTemplate.findMany({
      where: { id: { in: idx.map((i) => i.deedId) }, status: "active", starterSourceId: null, NOT: { aiDraftStatus: "REVIEW_PENDING" } },
      select: { id: true, title: true, updatedAt: true },
    });
    const meta = new Map(deeds.map((d) => [d.id, d]));
    return idx
      .filter((i) => meta.has(i.deedId) && i.deedId !== excludeId)
      .map((i) => ({
        deedId: i.deedId,
        title: meta.get(i.deedId)!.title,
        updatedAt: meta.get(i.deedId)!.updatedAt,
        starred: i.starred,
        colony: i.colony,
        village: i.village,
        ward: i.ward,
        tehsil: i.tehsil,
        district: i.district,
      }));
  }

  // ---------- the request page ----------
  private async requestFor(id: string, t: TenantContext): Promise<DraftIntakeRow> {
    const row = (await this.prisma.draftIntake.findFirst({ where: { id, organizationId: t.organizationId } })) as DraftIntakeRow | null;
    if (!row || (!isManager(t.role) && row.assigneeId !== t.userId)) throw new NotFoundException("अनुरोध नहीं मिला।");
    return row;
  }

  async availability(requestId: string): Promise<AiDraftAvailability> {
    const t = requireTenantContext(this.cls);
    const row = await this.requestFor(requestId, t);
    const detail = toDetail(row, null, true);
    const pt = aiPropertyTypeOf(detail.registry?.property?.propertyType);
    const runs = await this.prisma.aiDraftRun.findMany({ where: { draftIntakeId: row.id }, orderBy: { createdAt: "desc" }, take: 5 });
    let reason: string | null = null;
    if (!REQUEST_DEED_TYPE[detail.deedType] || !pt) reason = "notSupported";
    else if (!(await this.config(t.organizationId)).enabled[pt]) reason = "typeOff";
    else if (!process.env.ANTHROPIC_API_KEY) reason = "noKey";
    const lastDeed = runs.find((r) => r.deedId)?.deedId;
    const deed = lastDeed ? await this.prisma.deedTemplate.findFirst({ where: { id: lastDeed }, select: { aiDraftStatus: true } }) : null;
    return {
      allowed: !reason,
      reason,
      propertyType: pt,
      runs: runs.map((r) => this.runItem(r, [])),
      deedStatus: deed?.aiDraftStatus ?? null,
      canStar: t.role === "OWNER",
    };
  }

  /** OWNER/ADMIN or the request's assignee: drafts the full deed, saves it as "AI ड्राफ्ट – समीक्षा बाकी". */
  async generate(requestId: string, user: StaffUser): Promise<AiDraftRunItem> {
    const t = requireTenantContext(this.cls);
    const row = await this.requestFor(requestId, t);
    const ref = requestRef(row.id);
    const detail = toDetail(row, null, true);
    const deedType = REQUEST_DEED_TYPE[detail.deedType];
    const pt = aiPropertyTypeOf(detail.registry?.property?.propertyType);
    if (!deedType || !pt) throw new BadRequestException("इस अनुरोध के लिए AI ड्राफ्ट उपलब्ध नहीं (दस्तावेज़ या संपत्ति का प्रकार पता नहीं)।");
    if (!(await this.config(t.organizationId)).enabled[pt]) throw new ForbiddenException("इस संपत्ति प्रकार के लिए AI ड्राफ्ट अभी बंद है।");
    if (!process.env.ANTHROPIC_API_KEY) throw new BadRequestException("AI सेट नहीं है (ANTHROPIC_API_KEY)।");
    const input = draftInput(detail, revealSecrets(row), pt)!;
    const target = targetPlace(detail.registry?.property ?? null);
    const examples = pickExamples(target, await this.candidates(t.organizationId, deedType, pt));
    const base = { organizationId: t.organizationId, draftIntakeId: row.id, deedType, propertyType: pt, model: AI_DRAFT_MODEL(), createdById: t.userId };

    if (!examples.length) {
      const run = await this.prisma.aiDraftRun.create({ data: { ...base, status: "NO_EXAMPLES", flags: input.flags } });
      this.log.log(`ai draft for request ${ref}: no ${deedType}/${pt} deeds in the archive`);
      return this.runItem(run, []);
    }
    const out = await this.draftOnce(t.organizationId, input, examples);
    const exampleItems = examples.map((e) => ({ deedId: e.deedId, title: e.title, score: e.score, reason: e.reason }));
    const tokens = { inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens };
    if (out.leaks > 0) {
      const run = await this.prisma.aiDraftRun.create({
        data: { ...base, status: "BLOCKED_LEAK", examples: exampleItems, flags: input.flags, ...tokens, costUsd: out.cost, issues: [{ code: "leak", message: "पुरानी डीड का निजी विवरण ड्राफ्ट में दिखा — ड्राफ्ट रोका गया।" }] },
      });
      this.log.warn(`ai draft for request ${ref}: blocked (leak check ${out.leaks})`);
      return this.runItem(run, []);
    }
    // Senior review on the tokenised text (no Aadhaar/PAN numbers leave).
    let reviewIssues: string[] = [];
    let cost = out.cost;
    try {
      const rev = await this.call({
        system: REVIEW_SYSTEM,
        user: `FACTS:\n${input.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n")}\n\nDRAFT:\n${out.text}`,
        maxTokens: 3000,
        effort: "medium",
      });
      reviewIssues = parseReview(rev.text);
      tokens.inputTokens += rev.inputTokens;
      tokens.outputTokens += rev.outputTokens;
      cost += costUsd(base.model, rev.inputTokens, rev.outputTokens);
    } catch (e: any) {
      reviewIssues = ["वरिष्ठ समीक्षा नहीं हो सकी — स्टाफ ध्यान से जाँचें।"];
      this.log.warn(`ai draft review failed for request ${ref}: ${e?.message ?? "error"}`);
    }
    const content = substituteTokens(out.text, input.tokens);
    const title = `${deedType === "sale-deed" ? "विक्रय पत्र" : "बंधक पत्र"} — अनुरोध ${ref} (AI ड्राफ्ट)`;
    const deedId = randomUUID();
    await this.prisma.deedTemplate.create({
      data: tenantCreateData<Prisma.DeedTemplateUncheckedCreateInput>({
        id: deedId,
        type: deedType,
        title,
        content,
        status: "active",
        aiDraftStatus: "REVIEW_PENDING",
        createdById: user.id,
        createdByName: user.name,
        createdByRole: user.role,
        createdAt: new Date(),
      }),
    });
    if (!(row as any).deedTemplateId) await this.prisma.draftIntake.update({ where: { id: row.id }, data: { deedTemplateId: deedId } });
    const run = await this.prisma.aiDraftRun.create({
      data: { ...base, status: "OK", deedId, examples: exampleItems, issues: out.issues as any, reviewIssues, flags: input.flags, ...tokens, costUsd: cost },
    });
    this.log.log(
      `ai draft for request ${ref}: ok, examples=${examples.length} issues=${out.issues.length} review=${reviewIssues.length} in=${tokens.inputTokens} out=${tokens.outputTokens} cost=$${cost.toFixed(4)}`,
    );
    return this.runItem(run, factsShown(input, out.text));
  }

  /** Masks the examples, calls the model, leak-checks and validates. Used by generate and the eval. */
  private async draftOnce(organizationId: string, input: DraftInput, examples: (Candidate & { score: number; reason: string })[]) {
    const rows = await this.prisma.deedTemplate.findMany({ where: { id: { in: examples.map((e) => e.deedId) } }, select: { id: true, content: true } });
    const masked = examples.map((e) => ({ e, m: maskArchive(rows.find((r) => r.id === e.deedId)?.content ?? "") }));
    const prompt = buildPrompt(input, masked.map(({ e, m }) => ({ title: e.title, text: m.text, reason: e.reason })));
    const usage = await this.call({ system: SYSTEM_PROMPT, user: prompt, maxTokens: 16000, effort: "high" });
    const text = cleanOutput(usage.text);
    const allowed = [...input.facts.map((f) => f.value), ...input.blocks];
    const leaks = leakCount(text, masked.flatMap(({ m }) => m.originals), allowed);
    const issues: Issue[] = validateDraft(text, input);
    if (usage.stopReason === "max_tokens") issues.push({ code: "truncated", message: "ड्राफ्ट पूरा नहीं बना (बहुत लंबा)।" });
    void organizationId;
    return { text, usage, leaks, issues, cost: costUsd(AI_DRAFT_MODEL(), usage.inputTokens, usage.outputTokens) };
  }

  /** Staff checked the AI draft: the deed loses the "समीक्षा बाकी" mark. */
  async markReviewed(deedId: string): Promise<{ ok: true }> {
    requireTenantContext(this.cls);
    const deed = await this.prisma.deedTemplate.findFirst({ where: { id: deedId }, select: { id: true, aiDraftStatus: true } });
    if (!deed) throw new NotFoundException("डीड नहीं मिली।");
    await this.prisma.deedTemplate.update({ where: { id: deedId }, data: { aiDraftStatus: deed.aiDraftStatus ? "REVIEWED" : null } });
    return { ok: true };
  }

  private runItem(r: any, facts: AiFactShown[]): AiDraftRunItem {
    return {
      id: r.id,
      status: r.status,
      deedId: r.deedId ?? null,
      deedType: r.deedType,
      propertyType: r.propertyType,
      model: r.model,
      examples: (r.examples as any[]) ?? [],
      facts,
      issues: (r.issues as any[]) ?? [],
      reviewIssues: (r.reviewIssues as string[]) ?? [],
      flags: (r.flags as string[]) ?? [],
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ---------- eval ----------
  /** OWNER: runs in the background on up to 50 recent archive deeds with synthetic parties. */
  async startEval(pt: AiPropertyType, deedType: DeedType): Promise<AiEvalItem> {
    const t = this.owner();
    if (!process.env.ANTHROPIC_API_KEY) throw new BadRequestException("AI सेट नहीं है (ANTHROPIC_API_KEY)।");
    const running = await this.prisma.aiEvalRun.findFirst({ where: { organizationId: t.organizationId, status: "RUNNING" } });
    if (running) throw new BadRequestException("एक eval पहले से चल रहा है।");
    const cands = await this.candidates(t.organizationId, deedType, pt);
    if (cands.length < EVAL_MIN) throw new BadRequestException(`इस प्रकार की कम से कम ${EVAL_MIN} पुरानी डीड चाहिए (अभी ${cands.length})।`);
    const targets = [...cands].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, EVAL_SIZE);
    const run = await this.prisma.aiEvalRun.create({
      data: { organizationId: t.organizationId, deedType, propertyType: pt, total: targets.length, createdById: t.userId },
    });
    this.log.log(`eval ${deedType}/${pt} started on ${targets.length} deeds`);
    // Background, with the same tenant context (DeedTemplate reads are tenant-scoped).
    void this.cls.run(async () => {
      this.cls.set(TENANT_KEY, t);
      await this.runEval(run.id, t.organizationId, deedType, pt, targets, cands).catch(async (e) => {
        this.log.error(`eval ${run.id} failed: ${e?.message ?? "error"}`);
        await this.prisma.aiEvalRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date() } });
      });
    });
    return this.evalItem(run);
  }

  async runEval(runId: string, organizationId: string, deedType: DeedType, pt: AiPropertyType, targets: Candidate[], all: Candidate[]): Promise<void> {
    const details: AiEvalItem["details"] = [];
    let passed = 0;
    let cost = 0;
    for (const [i, target] of targets.entries()) {
      const input = syntheticInput(deedType, pt, target, i);
      const examples = pickExamples(target, all.filter((c) => c.deedId !== target.deedId));
      let problems: string[] = [];
      try {
        const out = await this.draftOnce(organizationId, input, examples);
        cost += out.cost;
        problems = out.issues.filter((x) => EVAL_FAIL.has(x.code) || x.code === "truncated").map((x) => x.message);
        if (out.leaks > 0) problems.push("पुरानी डीड का निजी विवरण ड्राफ्ट में आया");
      } catch (e: any) {
        problems = [`मॉडल कॉल विफल (${e?.message ?? "error"})`];
      }
      if (!problems.length) passed++;
      details.push({ deedId: target.deedId, pass: !problems.length, problems });
      await this.prisma.aiEvalRun.update({ where: { id: runId }, data: { done: i + 1, passed, costUsd: cost, details } });
    }
    const score = targets.length ? passed / targets.length : 0;
    await this.prisma.aiEvalRun.update({ where: { id: runId }, data: { status: "DONE", score, finishedAt: new Date() } });
    this.log.log(`eval ${deedType}/${pt}: ${passed}/${targets.length} passed, cost=$${cost.toFixed(2)}`);
  }

  async evals(): Promise<AiEvalItem[]> {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    const rows = await this.prisma.aiEvalRun.findMany({ where: { organizationId: t.organizationId }, orderBy: { startedAt: "desc" }, take: 20 });
    return rows.map((r) => this.evalItem(r));
  }

  private evalItem(r: any): AiEvalItem {
    return {
      id: r.id,
      deedType: r.deedType,
      propertyType: r.propertyType,
      status: r.status,
      total: r.total,
      done: r.done,
      passed: r.passed,
      score: r.score,
      costUsd: r.costUsd,
      details: (r.details as AiEvalItem["details"]) ?? [],
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }
}

/** Place of the new property, from the registry read ("वार्ड 66, सालूपुरा" → ward 66 + colony). */
export function targetPlace(p: { locality: string | null; village: string | null; tehsil: string | null; district: string | null } | null): PlaceText {
  const loc = p?.locality ?? "";
  const ward = loc.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).match(/वार्ड\s*(?:क्रमांक|क्र\.?|नं\.?)?\s*(\d{1,3})/)?.[1] ?? null;
  const colony = loc.replace(/वार्ड\s*(?:क्रमांक|क्र\.?|नं\.?)?\s*[\d०-९]{1,3}\s*,?\s*/g, "").replace(/\(.*?\)/g, "").trim() || null;
  return { colony, village: p?.village ?? null, ward, tehsil: p?.tehsil ?? null, district: p?.district ?? null };
}

/** Facts shown to staff: Aadhaar/PAN only to the last 4; found = present in the model's text. */
export function factsShown(input: DraftInput, text: string): AiFactShown[] {
  const flat = text.replace(/\s+/g, " ");
  return input.facts.map((f) => {
    const real = input.tokens[f.value];
    const shown = real ? `XXXX ${real.replace(/\s+/g, "").slice(-4)}` : f.value;
    return { label: f.label, value: shown, source: FACT_SOURCE_HI[f.source], found: flat.includes(f.value.replace(/\s+/g, " ")) };
  });
}

export function parseReview(text: string): string[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").map((x: string) => x.slice(0, 300)).slice(0, 10) : [];
  } catch {
    return [];
  }
}

/** Eval case: the archive deed's place (not personal), synthetic parties / numbers -- no old customer data. */
export function syntheticInput(deedType: DeedType, pt: AiPropertyType, place: PlaceText, i: number): DraftInput {
  const n = i + 1;
  const aad = `[[AADHAAR_1]]`;
  const tokens = { [aad]: "9999 0000 " + String(1000 + n).slice(-4) };
  const seller = formatParty({ name: `परीक्षण विक्रेता ${n}`, relation: "पुत्र", guardian: `परीक्षण पिता ${n}` });
  const buyer = formatParty({ name: `परीक्षण क्रेता ${n}`, relation: "पुत्र", guardian: `परीक्षण अभिभावक ${n}`, aadhaar: aad });
  const plotNo = `${40 + n}/परीक्षण`;
  const prop = formatPropertyBlock({
    propertyType: pt === "agricultural" ? "agricultural" : "residential_plot",
    khasraOrPlotNo: plotNo,
    village: place.village,
    locality: place.colony ?? (place.ward ? `वार्ड ${place.ward}` : null),
    tehsil: place.tehsil,
    district: place.district,
    areaValue: pt === "agricultural" ? 0.5 : 1500,
    areaUnit: pt === "agricultural" ? "हेक्टेयर" : "वर्गफुट",
  });
  const mortgage = deedType === "equitable-mortgage-deed";
  const blocks = mortgage
    ? [formatPartyBlock("बंधककर्ता", [buyer]), formatPartyBlock("गवाह", [seller]), prop]
    : [formatPartyBlock("विक्रेता पक्ष", [seller]), formatPartyBlock("क्रेता पक्ष", [buyer]), prop];
  return {
    deedType,
    propertyType: pt,
    facts: [
      { key: "buyerName", label: mortgage ? "बंधककर्ता का नाम" : "क्रेता का नाम", value: `परीक्षण क्रेता ${n}`, source: "customer", required: true },
      { key: "buyerAadhaar", label: "आधार", value: aad, source: "idCard", required: true },
      { key: "khasra", label: "क्रमांक", value: plotNo, source: "oldRegistry", required: true },
      ...(mortgage ? [] : [{ key: "amount", label: "प्रतिफल राशि", value: String(1_200_000 + n * 1000), source: "customer" as const, required: true }]),
    ],
    blocks,
    tokens,
    flags: pt === "agricultural" ? ["कृषि भूमि — सर्वे क्रमांक, रकबा (हेक्टेयर)"] : [],
  };
}
