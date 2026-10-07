import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Prisma } from "@prisma/client";
import {
  type ColonyBuyer,
  type ColonyCheck,
  type ColonyDashboard,
  type ColonyImportResult,
  type ColonyPartner,
  type ColonyPlot,
  type ColonyProject,
  type ColonyProjectInput,
  type ColonySale,
  type ColonySaleInput,
  type ColonyGuidelineRow,
  type ColonySetupSuggestion,
  type ColonySoldPlotsInput,
  type Instalment,
} from "@sampada/shared";
import { boundaryNamesSelf, buildSetupSuggestion, colonyGuideline, devanagariForms, duplicateClauses, guidelineCandidates, templateLeftovers } from "./colony-setup.js";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { TENANT_KEY } from "../tenant/tenant-context.js";
import { ColonyPaperExtractor, mapPaper, matchPartner, saleGaps } from "./colony-paper.js";
import type { TenantContext } from "../tenant/tenant-context.js";
import { normalizePhone } from "../tasks/tasks.service.js";
import { decrypt, encrypt, mask } from "../whatsapp/pii-crypto.js";
import { maskPhone } from "../whatsapp/webhook-diagnostics.js";
import {
  boundaryBlock,
  buyerBlock,
  deedTitle,
  fillTemplate,
  missingMarkers,
  parseCompanySale,
  parsePlotRef,
  parsePlots,
  parseUnitRef,
  paymentBlock,
  plotBlock,
  plotLabel,
  readTable,
  saleChecks,
  suggestTemplate,
} from "./colony-rules.js";

const isManager = (role: string) => role === "OWNER" || role === "ADMIN";
type BuyerStored = Omit<ColonyBuyer, "aadhaar" | "pan"> & { aadhaar: string | null; pan: string | null };

/**
 * Colony auto-draft. Setup (project master, plot import, template) is
 * OWNER/ADMIN; "live" is OWNER only; any staff member enters sales and
 * creates deeds once the project is live. Company people write on WhatsApp
 * (company mode). Aadhaar/PAN are stored encrypted and never logged.
 */
@Injectable()
export class ColonyService {
  private readonly log = new Logger("Colony");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  /** Company number → the project it last wrote about (company mode, several projects). */
  private readonly lastProject = new Map<string, { id: string; until: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @Optional() private readonly paper?: ColonyPaperExtractor,
  ) {}

  private manager(): TenantContext {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    return t;
  }

  private async project(id: string, organizationId: string) {
    const p = await this.prisma.colonyProject.findFirst({ where: { id, organizationId } });
    if (!p) throw new NotFoundException("प्रोजेक्ट नहीं मिला।");
    return p;
  }

  private async readiness(p: any): Promise<string[]> {
    const out: string[] = [];
    const miss = missingMarkers(p.template ?? "");
    if (miss.length) out.push(`मानक टेक्स्ट में ये हिस्से चिह्नित नहीं: ${miss.join(", ")}`);
    const partners = (p.partners as ColonyPartner[]) ?? [];
    if (!partners.length || partners.some((x) => x.text.includes("____"))) out.push("भागीदारों का पूरा विवरण भरें।");
    const tpl = String(p.template ?? "");
    const filled = (k: "devPermissions" | "maintenanceClauses") => ((p[k] as string[]) ?? []).some((x) => x.trim());
    // A marker with empty fields would drop the whole paragraph from every deed.
    if (tpl.includes("{{DEV_PERMISSION}}") && !filled("devPermissions")) out.push("मानक टेक्स्ट में {{DEV_PERMISSION}} है पर विकास अनुमति के खाने खाली हैं — पूरा पैरा डीड से छूट जाएगा।");
    if (!tpl.includes("{{DEV_PERMISSION}}") && !filled("devPermissions") && !/अनुमति|स्वीकृति|अनुज्ञा/.test(tpl)) out.push("विकास अनुमति न मानक टेक्स्ट में है न खानों में — भरें।");
    // One maintenance clause is enough (the second is optional); it must appear only once in the deed.
    if (tpl.includes("{{MAINTENANCE}}") && !filled("maintenanceClauses")) out.push("मानक टेक्स्ट में {{MAINTENANCE}} है पर रखरखाव की शर्त खाली है — भरें (एक काफ़ी है)।");
    if (!tpl.includes("{{MAINTENANCE}}") && !filled("maintenanceClauses") && !/रखरखाव|रख-रखाव|मेंटेनेंस/.test(tpl)) out.push("रखरखाव की शर्त भरें (एक काफ़ी है)।");
    const left = templateLeftovers(tpl);
    if (left.length) out.push(`मानक टेक्स्ट में किसी पुरानी बिक्री की बातें बची हैं: ${left.join(", ")}।`);
    const dup = contentChecks({ ...p, template: p.template ?? "" }, null).find((c) => c.code === "duplicateClause");
    if (dup) out.push(dup.message);
    if (!(await this.prisma.colonyPlot.count({ where: { projectId: p.id } }))) out.push('प्लाट मास्टर भरें — Excel/CSV आयात, या सेटअप → "पुरानी डीड से Setup भरें" → बिके प्लाट आयात।');
    return out;
  }

  private async projectItem(p: any): Promise<ColonyProject> {
    return {
      id: p.id,
      name: p.name,
      kind: p.kind === "SHOP" ? "SHOP" : "PLOT",
      village: p.village,
      ward: p.ward ?? "",
      surveyNos: p.surveyNos ?? "",
      aliases: p.aliases ?? "",
      guidelineSno: p.guidelineSno ?? null,
      developer: p.developer,
      partners: (p.partners as ColonyPartner[]) ?? [],
      devPermissions: (p.devPermissions as string[]) ?? [],
      maintenanceClauses: (p.maintenanceClauses as string[]) ?? [],
      guidelineRatePerSqm: p.guidelineRatePerSqm,
      template: p.template,
      templateDeedId: p.templateDeedId,
      companyNumbers: (p.companyNumbers as string[]) ?? [],
      live: p.live,
      readiness: await this.readiness(p),
      createdAt: p.createdAt.toISOString(),
    };
  }

  // ---------- projects ----------
  async projects(): Promise<ColonyProject[]> {
    const t = requireTenantContext(this.cls);
    const rows = await this.prisma.colonyProject.findMany({ where: { organizationId: t.organizationId }, orderBy: { createdAt: "asc" } });
    return Promise.all(rows.map((r) => this.projectItem(r)));
  }

  /** Saving a standard text that still carries one old sale's amount / UTR / cheque / DD / block line is refused. */
  private checkTemplate(template: string) {
    const left = templateLeftovers(template);
    if (left.length) throw new BadRequestException(`मानक टेक्स्ट में किसी पुरानी बिक्री की बातें बची हैं: ${left.join(", ")} — इन्हें {{PLOT}} / {{PAYMENT}} से बदलें।`);
  }

  async create(input: ColonyProjectInput): Promise<ColonyProject> {
    const t = this.manager();
    this.checkTemplate(input.template);
    if (await this.prisma.colonyProject.findFirst({ where: { organizationId: t.organizationId, name: input.name } })) {
      throw new BadRequestException("इस नाम का प्रोजेक्ट पहले से है।");
    }
    const row = await this.prisma.colonyProject.create({ data: { organizationId: t.organizationId, ...this.projectData(input) } });
    this.log.log(`project created: ${row.name}`);
    return this.projectItem(row);
  }

  async update(id: string, input: ColonyProjectInput): Promise<ColonyProject> {
    const t = this.manager();
    this.checkTemplate(input.template);
    await this.project(id, t.organizationId);
    const row = await this.prisma.colonyProject.update({ where: { id }, data: this.projectData(input) });
    return this.projectItem(row);
  }

  private projectData(i: ColonyProjectInput) {
    return {
      name: i.name,
      kind: i.kind,
      village: i.village,
      ward: i.ward,
      surveyNos: i.surveyNos,
      aliases: i.aliases,
      guidelineSno: i.guidelineSno,
      developer: i.developer,
      partners: i.partners as any,
      devPermissions: i.devPermissions as any,
      maintenanceClauses: i.maintenanceClauses as any,
      guidelineRatePerSqm: i.guidelineRatePerSqm,
      template: i.template,
      templateDeedId: i.templateDeedId,
      companyNumbers: i.companyNumbers.map((n) => normalizePhone(n)).filter((n): n is string => !!n) as any,
    };
  }

  /** OWNER only; going live needs a complete project. */
  async setLive(id: string, live: boolean): Promise<ColonyProject> {
    const t = requireTenantContext(this.cls);
    if (t.role !== "OWNER") throw new ForbiddenException("प्रोजेक्ट को लाइव केवल मालिक कर सकते हैं।");
    const p = await this.project(id, t.organizationId);
    if (live) {
      const r = await this.readiness(p);
      if (r.length) throw new BadRequestException(`अभी लाइव नहीं हो सकता: ${r.join(" ")}`);
    }
    const row = await this.prisma.colonyProject.update({ where: { id }, data: { live } });
    this.log.log(`project ${row.name}: live=${live}`);
    return this.projectItem(row);
  }

  /** Template suggested from an old deed of the project (owner checks it before saving). */
  async suggest(deedId: string): Promise<{ template: string; found: string[]; missing: string[] }> {
    this.manager();
    const deed = await this.prisma.deedTemplate.findFirst({ where: { id: deedId }, select: { content: true } });
    if (!deed) throw new NotFoundException("डीड नहीं मिली।");
    const s = suggestTemplate(deed.content);
    return { ...s, missing: missingMarkers(s.template) };
  }

  // ---------- plots ----------
  async plots(projectId: string): Promise<ColonyPlot[]> {
    const t = requireTenantContext(this.cls);
    await this.project(projectId, t.organizationId);
    const rows = await this.prisma.colonyPlot.findMany({ where: { projectId }, orderBy: [{ block: "asc" }, { plotNo: "asc" }] });
    return rows
      .map((r) => ({ id: r.id, block: r.block, plotNo: r.plotNo, ewFt: r.ewFt, nsFt: r.nsFt, areaSqft: r.areaSqft, east: r.east, west: r.west, north: r.north, south: r.south, corner: r.corner, floor: r.floor, status: r.status as ColonyPlot["status"] }))
      .sort((a, b) => a.block.localeCompare(b.block) || a.plotNo.localeCompare(b.plotNo, undefined, { numeric: true }));
  }

  async importPlots(projectId: string, file: { buffer: Buffer; originalname: string }): Promise<ColonyImportResult> {
    const t = this.manager();
    await this.project(projectId, t.organizationId);
    let rows: string[][];
    try {
      rows = readTable(file.buffer, file.originalname);
    } catch {
      throw new BadRequestException("फ़ाइल पढ़ी नहीं जा सकी (Excel .xlsx या CSV भेजें)।");
    }
    const { plots, errors } = parsePlots(rows);
    let added = 0;
    let updated = 0;
    for (const p of plots) {
      const { row: _row, ...data } = p;
      const existing = await this.prisma.colonyPlot.findFirst({ where: { projectId, block: p.block, plotNo: p.plotNo } });
      if (existing) {
        await this.prisma.colonyPlot.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.colonyPlot.create({ data: { organizationId: t.organizationId, projectId, ...data } });
        added++;
      }
    }
    this.log.log(`plots imported: +${added} ~${updated} errors=${errors.length}`);
    return { added, updated, errors };
  }

  // ---------- sales ----------
  private async nextNumber(projectId: string) {
    const last = await this.prisma.colonySale.findFirst({ where: { projectId }, orderBy: { number: "desc" }, select: { number: true } });
    return (last?.number ?? 0) + 1;
  }

  private storeBuyers(buyers: ColonyBuyer[], old: BuyerStored[] = []): BuyerStored[] {
    return buyers.map((b, i) => ({
      ...b,
      // An empty Aadhaar / PAN on edit keeps the stored one.
      aadhaar: b.aadhaar.replace(/\s+/g, "") ? encrypt(b.aadhaar.replace(/\s+/g, "")) : (old[i]?.aadhaar ?? null),
      pan: b.pan.trim() ? encrypt(b.pan.trim().toUpperCase()) : (old[i]?.pan ?? null),
    }));
  }

  private async checksFor(sale: { id?: string; plotId: string; consideration: number; instalments: Instalment[]; buyers: BuyerStored[]; partnerKey: string }, project: any): Promise<ColonyCheck[]> {
    const plot = await this.prisma.colonyPlot.findFirst({ where: { id: sale.plotId } });
    const other = await this.prisma.colonySale.findFirst({ where: { plotId: sale.plotId, status: { not: "CANCELLED" }, ...(sale.id ? { id: { not: sale.id } } : {}) } });
    const checks = saleChecks({
      consideration: sale.consideration,
      instalments: sale.instalments,
      buyers: sale.buyers.map((b) => ({ ...b, aadhaar: b.aadhaar ? "x" : "", pan: b.pan ? "x" : "" })),
      plot: { areaSqft: plot?.areaSqft ?? null, ewFt: plot?.ewFt ?? null, nsFt: plot?.nsFt ?? null },
      guideline: plot ? colonyGuideline(project, plot) : null,
      otherSaleOfPlot: !!other,
      plotSold: plot?.status === "SOLD",
    });
    if (!((project.partners as ColonyPartner[]) ?? []).some((p) => p.key === sale.partnerKey)) {
      checks.push({ level: "error", code: "partner", message: "भागीदार चुनें।" });
    }
    if (!project.live) checks.push({ level: "warning", code: "notLive", message: "प्रोजेक्ट अभी लाइव नहीं — डीड मालिक के लाइव करने के बाद बनेगी।" });
    checks.push(...contentChecks(project, plot));
    return checks;
  }

  private async saleItem(s: any, project: any): Promise<ColonySale> {
    const plot = await this.prisma.colonyPlot.findFirst({ where: { id: s.plotId } });
    const buyers = (s.buyers as BuyerStored[]).map(({ aadhaar, pan, ...b }) => ({
      ...b,
      aadhaarMasked: aadhaar ? safeMask(aadhaar) : null,
      panMasked: pan ? safeMask(pan) : null,
    }));
    const deed = s.deedId ? await this.prisma.deedTemplate.findFirst({ where: { id: s.deedId }, select: { type: true } }) : null;
    return {
      id: s.id,
      number: s.number,
      plotId: s.plotId,
      plotLabel: plot ? plotLabel(plot.block, plot.plotNo) : "—",
      partnerKey: s.partnerKey,
      buyers,
      consideration: s.consideration,
      instalments: s.instalments as Instalment[],
      source: s.source,
      status: s.status,
      deedId: s.deedId,
      deedType: deed?.type ?? null,
      title: plot ? deedTitle(project.name, plot.block, plot.plotNo, buyers[0]?.name ?? "") : "—",
      checks: s.status === "DRAFT" ? await this.checksFor({ ...s, instalments: s.instalments as Instalment[], buyers: s.buyers as BuyerStored[] }, project) : [],
      createdAt: s.createdAt.toISOString(),
    };
  }

  async sales(projectId: string): Promise<ColonySale[]> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    const rows = await this.prisma.colonySale.findMany({ where: { projectId }, orderBy: { number: "desc" }, take: 500 });
    return Promise.all(rows.map((r) => this.saleItem(r, p)));
  }

  async createSale(projectId: string, input: ColonySaleInput, source: "web" | "excel" = "web"): Promise<ColonySale> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    const plot = await this.prisma.colonyPlot.findFirst({ where: { id: input.plotId, projectId } });
    if (!plot) throw new BadRequestException("यह प्लाट इस प्रोजेक्ट में नहीं है।");
    const buyers = this.storeBuyers(input.buyers);
    const checks = await this.checksFor({ ...input, buyers }, p);
    if (checks.some((c) => c.code === "doubleSale")) throw new BadRequestException(checks.find((c) => c.code === "doubleSale")!.message);
    const row = await this.prisma.colonySale.create({
      data: {
        organizationId: t.organizationId,
        projectId,
        number: await this.nextNumber(projectId),
        plotId: plot.id,
        partnerKey: input.partnerKey,
        buyers: buyers as any,
        consideration: input.consideration,
        instalments: input.instalments as any,
        source,
        createdById: t.userId,
      },
    });
    await this.prisma.colonyPlot.update({ where: { id: plot.id }, data: { status: "DRAFTED" } });
    this.log.log(`sale #${row.number} (${source}) for ${plotLabel(plot.block, plot.plotNo)}`);
    return this.saleItem(row, p);
  }

  async updateSale(projectId: string, saleId: string, input: ColonySaleInput): Promise<ColonySale> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    const s = await this.prisma.colonySale.findFirst({ where: { id: saleId, projectId } });
    if (!s) throw new NotFoundException("बिक्री नहीं मिली।");
    if (s.status !== "DRAFT") throw new BadRequestException("डीड बन चुकी है — बदलाव डीड में करें।");
    if (input.plotId !== s.plotId) throw new BadRequestException("प्लाट बदलना हो तो यह बिक्री रद्द करके नई दर्ज करें।");
    const buyers = this.storeBuyers(input.buyers, s.buyers as BuyerStored[]);
    const row = await this.prisma.colonySale.update({
      where: { id: saleId },
      data: { partnerKey: input.partnerKey, buyers: buyers as any, consideration: input.consideration, instalments: input.instalments as any },
    });
    return this.saleItem(row, p);
  }

  async cancelSale(projectId: string, saleId: string): Promise<ColonySale> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    const s = await this.prisma.colonySale.findFirst({ where: { id: saleId, projectId } });
    if (!s) throw new NotFoundException("बिक्री नहीं मिली।");
    if (s.status === "DEED_CREATED" && !isManager(t.role)) throw new ForbiddenException("डीड बनी बिक्री केवल मालिक/एडमिन रद्द कर सकते हैं।");
    const row = await this.prisma.colonySale.update({ where: { id: saleId }, data: { status: "CANCELLED" } });
    const others = await this.prisma.colonySale.count({ where: { plotId: s.plotId, status: { not: "CANCELLED" } } });
    if (!others) await this.prisma.colonyPlot.update({ where: { id: s.plotId }, data: { status: "AVAILABLE" } });
    return this.saleItem(row, p);
  }

  /** Fills the 4 blocks into the colony text and saves the deed (live projects, no error checks). */
  async createDeed(projectId: string, saleId: string, user: StaffUser): Promise<ColonySale> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    if (!p.live) throw new BadRequestException("प्रोजेक्ट अभी लाइव नहीं है (मालिक लाइव करेंगे)।");
    const s = await this.prisma.colonySale.findFirst({ where: { id: saleId, projectId } });
    if (!s) throw new NotFoundException("बिक्री नहीं मिली।");
    if (s.status !== "DRAFT") throw new BadRequestException("इस बिक्री की डीड पहले बन चुकी है या बिक्री रद्द है।");
    const buyers = s.buyers as BuyerStored[];
    const instalments = s.instalments as Instalment[];
    const errors = (await this.checksFor({ ...s, buyers, instalments }, p)).filter((c) => c.level === "error");
    if (errors.length) throw new BadRequestException(errors.map((e) => e.message).join(" "));
    const row = await this.makeDeed(p, s, { id: user.id, name: user.name, role: user.role });
    return this.saleItem(row, p);
  }

  /** The deed from the colony text (tenant context must be set: DeedTemplate is tenant-scoped). */
  private async makeDeed(p: any, s: any, creator: { id: string; name: string; role: string }) {
    const buyers = s.buyers as BuyerStored[];
    const instalments = s.instalments as Instalment[];
    const plot = (await this.prisma.colonyPlot.findFirst({ where: { id: s.plotId } }))!;
    const partner = ((p.partners as ColonyPartner[]) ?? []).find((x) => x.key === s.partnerKey)!;
    const content = fillTemplate(p.template, {
      BUYER: buyerBlock(
        buyers.map((b) => ({ ...b, aadhaar: "", pan: "", aadhaarText: b.aadhaar ? safeDecrypt(b.aadhaar) : undefined, panText: b.pan ? safeDecrypt(b.pan) : undefined })),
      ),
      PLOT: plotBlock(plot, p.kind),
      BOUNDARY: boundaryBlock(plot, p.kind),
      PAYMENT: paymentBlock(s.consideration, instalments),
      PARTNER: partner.text,
      DEV_PERMISSION: ((p.devPermissions as string[]) ?? []).filter(Boolean).join("\n"),
      MAINTENANCE: ((p.maintenanceClauses as string[]) ?? []).filter(Boolean).join("\n\n"),
    });
    const deedId = randomUUID();
    await this.prisma.deedTemplate.create({
      data: tenantCreateData<Prisma.DeedTemplateUncheckedCreateInput>({
        id: deedId,
        type: "sale-deed",
        title: deedTitle(p.name, plot.block, plot.plotNo, buyers[0]?.name ?? ""),
        content,
        status: "active",
        createdById: creator.id,
        createdByName: creator.name,
        createdByRole: creator.role,
        createdAt: new Date(),
      }),
    });
    const row = await this.prisma.colonySale.update({ where: { id: s.id }, data: { status: "DEED_CREATED", deedId } });
    await this.prisma.colonyPlot.update({ where: { id: plot.id }, data: { status: "SOLD" } });
    this.log.log(`sale #${s.number}: deed created`);
    return row;
  }

  /**
   * Excel sales: one row per sale -- ब्लॉक, प्लाट, क्रेता, संबंध, पिता/पति,
   * माता, पता, मोबाइल, ईमेल, राशि, भुगतान दिनांक, माध्यम, भागीदार. Aadhaar
   * is added on the web form.
   */
  async importSales(projectId: string, file: { buffer: Buffer; originalname: string }): Promise<ColonyImportResult> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    const rows = readTable(file.buffer, file.originalname);
    const head = (rows[0] ?? []).map((h) => h.trim());
    const col = (re: RegExp) => head.findIndex((h) => re.test(h));
    const c = {
      block: col(/^(ब्लॉक|ब्लाक|block)$/i),
      plot: col(/^(प्ला(ट|ॅट)|plot)/i),
      name: col(/^(क्रेता|खरीदार|buyer)/i),
      rel: col(/^(संबंध|relation)/i),
      guardian: col(/^(पिता|पति|पिता\/पति|father|guardian)/i),
      mother: col(/^(माता|mother)/i),
      address: col(/^(पता|address)/i),
      mobile: col(/^(मोबाइल|mobile)/i),
      email: col(/^(ईमेल|email)/i),
      amount: col(/^(राशि|प्रतिफल|amount)/i),
      date: col(/^(भुगतान\s*दिनांक|दिनांक|date)/i),
      mode: col(/^(माध्यम|mode)/i),
      partner: col(/^(भागीदार|partner)/i),
    };
    const errors: { row: number; reason: string }[] = [];
    let added = 0;
    if (c.block < 0 || c.plot < 0 || c.name < 0 || c.amount < 0) {
      return { added: 0, updated: 0, errors: [{ row: 1, reason: "ब्लॉक, प्लाट, क्रेता और राशि के कॉलम चाहिए।" }] };
    }
    const partners = (p.partners as ColonyPartner[]) ?? [];
    for (const [i, r] of rows.slice(1).entries()) {
      const row = i + 2;
      const get = (k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
      const plot = await this.prisma.colonyPlot.findFirst({ where: { projectId, block: get(c.block).toUpperCase(), plotNo: get(c.plot) } });
      if (!plot) {
        errors.push({ row, reason: `ब्लॉक ${get(c.block)} प्लाट ${get(c.plot)} प्लाट मास्टर में नहीं।` });
        continue;
      }
      const amount = Number(get(c.amount).replace(/[^\d]/g, ""));
      const rel = /पत्नी|wife|w\/o/i.test(get(c.rel)) ? "पत्नी" : /पुत्री|daughter|d\/o/i.test(get(c.rel)) ? "पुत्री" : "पुत्र";
      const mode = /नकद|cash/i.test(get(c.mode)) ? "cash" : /चै?क|cheque/i.test(get(c.mode)) ? "cheque" : /upi/i.test(get(c.mode)) ? "upi" : "rtgs";
      const dateRaw = get(c.date).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
      const date = dateRaw ? `${dateRaw[3]}-${dateRaw[2]!.padStart(2, "0")}-${dateRaw[1]!.padStart(2, "0")}` : new Date().toISOString().slice(0, 10);
      const partner = partners.find((x) => x.label === get(c.partner) || x.key === get(c.partner).toLowerCase())?.key ?? partners[0]?.key ?? "";
      try {
        await this.createSale(
          projectId,
          {
            plotId: plot.id,
            partnerKey: partner,
            consideration: amount,
            instalments: [{ date, amount, mode: mode as Instalment["mode"], ref: "" }],
            buyers: [
              {
                name: get(c.name),
                relation: rel as ColonyBuyer["relation"],
                guardian: get(c.guardian),
                motherName: get(c.mother),
                address: get(c.address),
                mobile: get(c.mobile).replace(/\D/g, "").slice(-10),
                email: get(c.email),
                aadhaar: "",
                pan: "",
              },
            ],
          },
          "excel",
        );
        added++;
      } catch (e: any) {
        errors.push({ row, reason: e?.message ?? "दर्ज नहीं हुई" });
      }
    }
    return { added, updated: 0, errors };
  }

  async dashboard(projectId: string): Promise<ColonyDashboard> {
    const t = requireTenantContext(this.cls);
    const p = await this.project(projectId, t.organizationId);
    const plots = await this.prisma.colonyPlot.findMany({ where: { projectId }, select: { block: true, status: true } });
    const sales = await this.sales(projectId);
    const live = sales.filter((s) => s.status !== "CANCELLED");
    const blocks = [...new Set(plots.map((x) => x.block))].sort();
    return {
      project: await this.projectItem(p),
      plots: {
        total: plots.length,
        available: plots.filter((x) => x.status === "AVAILABLE").length,
        drafted: plots.filter((x) => x.status === "DRAFTED").length,
        sold: plots.filter((x) => x.status === "SOLD").length,
        byBlock: blocks.map((b) => ({ block: b, total: plots.filter((x) => x.block === b).length, available: plots.filter((x) => x.block === b && x.status === "AVAILABLE").length })),
      },
      sales: {
        total: live.length,
        deeds: live.filter((s) => s.status === "DEED_CREATED").length,
        consideration: live.reduce((a, s) => a + s.consideration, 0),
        withErrors: live.filter((s) => s.checks.some((c) => c.level === "error")).length,
        withWarnings: live.filter((s) => s.checks.some((c) => c.level === "warning")).length,
      },
    };
  }

  // ---------- Setup from the project's old deeds ----------
  /** The words to find the project's old deeds / to spot it in a message: name + aliases. */
  static names(p: { name: string; aliases?: string | null }): string[] {
    return [p.name, ...String(p.aliases ?? "").split(/[,\n]/)].map((x) => x.trim()).filter((x) => x.length >= 3);
  }

  /**
   * Reads the office's old sale deeds of this project (title / text with the
   * name or an alias; similar titles too, e.g. "phlora siti") and suggests the
   * whole Setup with the deed each value came from. Nothing is saved here.
   */
  async setupSuggest(projectId: string, extra = ""): Promise<ColonySetupSuggestion> {
    const t = this.manager();
    const p = await this.project(projectId, t.organizationId);
    const base = [...ColonyService.names(p), ...extra.split(",").map((x) => x.trim()).filter((x) => x.length >= 3)];
    // A Latin name also in Devanagari ("FLORA CITY" → "फ्लोरा सिटी", "फ्लोरा"): most deeds are written in Hindi.
    const names = [...new Set([...base, ...base.flatMap((n) => devanagariForms(n))])];
    const generated = new Set(
      (await this.prisma.colonySale.findMany({ where: { projectId, deedId: { not: null } }, select: { deedId: true } })).map((x) => x.deedId),
    );
    // Sale deeds only (never mortgage / agreement deeds); invisible joiners ignored; similar titles too ("phlora siti").
    let ids: string[] = [];
    try {
      const patterns = names.map((n) => `%${n.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      ids = (
        await this.prisma.$unscoped.$queryRaw<{ id: string }[]>`
          SELECT id FROM "DeedTemplate"
          WHERE "organizationId" = ${t.organizationId} AND status = 'active' AND type = 'sale-deed'
            AND (translate(title || ' ' || content, chr(8203) || chr(8204) || chr(8205) || chr(65279), '') ILIKE ANY (${patterns})
                 OR similarity(title, ${p.name}) > 0.25)
          ORDER BY "createdAt" DESC LIMIT 400`
      ).map((x) => x.id);
    } catch {
      ids = (
        await this.prisma.deedTemplate.findMany({
          where: { status: "active", type: "sale-deed", OR: names.flatMap((n) => [{ title: { contains: n, mode: "insensitive" as const } }, { content: { contains: n, mode: "insensitive" as const } }]) },
          select: { id: true },
          orderBy: { createdAt: "desc" },
          take: 400,
        })
      ).map((x) => x.id);
    }
    const rows = ids.length
      ? await this.prisma.deedTemplate.findMany({ where: { id: { in: ids.filter((id) => !generated.has(id)) }, type: "sale-deed" }, select: { id: true, title: true, content: true, createdAt: true } })
      : [];
    const deeds = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((d) => ({ id: d.id, title: d.title, content: d.content, date: d.createdAt }));
    const suggestion = { ...buildSetupSuggestion(deeds, names, p.kind === "SHOP" ? "SHOP" : "PLOT"), projectId };
    this.log.log(`setup suggestion for ${p.name}: ${deeds.length} deed(s), ${suggestion.plots.length} plot(s), ${suggestion.partners.length} partner variant(s)`);
    return suggestion;
  }

  /** Plots / units read from the old deeds, imported as SOLD (existing rows are updated and marked SOLD). */
  async importSoldPlots(projectId: string, input: ColonySoldPlotsInput): Promise<ColonyImportResult> {
    const t = this.manager();
    await this.project(projectId, t.organizationId);
    let added = 0;
    let updated = 0;
    for (const x of input.plots) {
      const data = { ...x, block: x.block.toUpperCase(), status: "SOLD" };
      const existing = await this.prisma.colonyPlot.findFirst({ where: { projectId, block: data.block, plotNo: x.plotNo } });
      if (existing) {
        await this.prisma.colonyPlot.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.colonyPlot.create({ data: { organizationId: t.organizationId, projectId, ...data } });
        added++;
      }
    }
    this.log.log(`sold plots from old deeds: +${added} ~${updated}`);
    return { added, updated, errors: [] };
  }

  async setCorner(projectId: string, plotId: string, corner: boolean): Promise<ColonyPlot[]> {
    const t = this.manager();
    await this.project(projectId, t.organizationId);
    const r = await this.prisma.colonyPlot.updateMany({ where: { id: plotId, projectId }, data: { corner } });
    if (!r.count) throw new NotFoundException("प्लाट नहीं मिला।");
    return this.plots(projectId);
  }

  /** Guideline rows of the office calculator matching a name (for the Setup picker). */
  guidelineSearch(q: string): ColonyGuidelineRow[] {
    this.manager();
    return guidelineCandidates([q], undefined, 8);
  }

  /** Company mode for a SHOP project: "TF-16" (unit status), "स्थिति". Sales of units are entered on the web. */
  private async handleCompanyUnits(p: any, phone: string, text: string): Promise<string[]> {
    const s = text.trim();
    const units = await this.prisma.colonyPlot.findMany({ where: { projectId: p.id } });
    if (/(स्थिति|status|डैशबोर्ड|dashboard|हिसाब)/i.test(s)) {
      const n = (st: string) => units.filter((x) => x.status === st).length;
      return [`${p.name}: कुल ${units.length} यूनिट — उपलब्ध ${n("AVAILABLE")}, ड्राफ्ट ${n("DRAFTED")}, बिके ${n("SOLD")}।`];
    }
    const ref = parseUnitRef(s.replace(new RegExp(p.name, "i"), ""));
    if (ref) {
      const u = units.find((x) => x.plotNo.replace(/\s+/g, "").toUpperCase() === ref);
      if (!u) return [`${p.name}: यूनिट ${ref} मास्टर में नहीं है।`];
      const st = u.status === "AVAILABLE" ? "उपलब्ध" : u.status === "DRAFTED" ? "बिक्री दर्ज (डीड बाकी)" : "बिक चुका";
      this.log.log(`company unit lookup from ${maskPhone(phone)}`);
      return [`${p.name} यूनिट ${u.plotNo}: ${st}\n${plotBlock(u, "SHOP")}`];
    }
    return [`${p.name} — कंपनी मोड:\n• यूनिट देखें: "TF-16"\n• कुल स्थिति: "स्थिति"\n• बिक्री: ऑफिस वेब पर दर्ज होगी।`];
  }

  // ---------- company paper (WhatsApp photo / PDF) ----------
  /** The colony projects this number sends for (company numbers). */
  private async companyProjects(phone: string) {
    if (!this.orgId) return [];
    const all = await this.prisma.colonyProject.findMany({ where: { organizationId: this.orgId } });
    // The owner in "कंपनी मोड" sends for any project, like a company number.
    if (this.inOwnerCompanyMode(phone)) return all;
    return all.filter((x) => ((x.companyNumbers as string[]) ?? []).includes(phone));
  }

  /** The owner's "कंपनी मोड" (30 minutes): their papers / texts go the company way. In memory: a restart ends it. */
  private readonly ownerCompanyMode = new Map<string, number>();
  startOwnerCompanyMode(phone: string, now = Date.now()): string[] {
    this.ownerCompanyMode.set(phone, now + 30 * 60_000);
    return [
      "🏢 कंपनी मोड 30 मिनट के लिए चालू। अब आपकी भेजी बिक्री की फ़ोटो / PDF कंपनी के कागज़ की तरह पढ़ी जाएगी और डीड अपने आप बनेगी।\n" +
        "• सारे पन्ने (डिटेल, भुगतान, नक्शा) एक साथ भेजें\n• प्लाट देखें: \"E-47\" • कुल स्थिति: \"स्थिति\"\n" +
        'वापस आने के लिए "ओनर मोड" लिखें।',
    ];
  }
  endOwnerCompanyMode(phone: string): boolean {
    return this.ownerCompanyMode.delete(phone);
  }
  inOwnerCompanyMode(phone: string, now = Date.now()): boolean {
    const until = this.ownerCompanyMode.get(phone);
    if (until && until > now) return true;
    if (until) this.ownerCompanyMode.delete(phone);
    return false;
  }

  async isCompanyNumber(phone: string): Promise<boolean> {
    return (await this.companyProjects(phone)).length > 0;
  }

  /**
   * A sale paper from a company number: read it, enter the sale and -- when
   * nothing is missing and the project is live -- make the deed at once. A
   * paper sent again for the same plot replaces its draft. null for anyone
   * else. Logs carry sale numbers and masked numbers only.
   */
  async handleCompanyFile(
    phone: string,
    files: { buf: Buffer; mime: string }[],
    caption: string,
  ): Promise<{ replies: string[]; ownerAlert: string | null } | null> {
    const projects = await this.companyProjects(phone);
    if (!projects.length) return null;
    if (!this.paper || !process.env.ANTHROPIC_API_KEY) return { replies: ["कागज़ पढ़ने की सुविधा अभी बंद है — बिक्री ऑफिस वेब पर दर्ज होगी।"], ownerAlert: null };
    const raw = await this.paper.extract(files);
    if (!raw) return { replies: ["कागज़ पढ़ा नहीं जा सका। साफ़ फ़ोटो (पूरा पन्ना, सीधा) या PDF दोबारा भेजें।"], ownerAlert: null };
    const sale = mapPaper(raw);
    const remembered = this.lastProject.get(phone);
    const p =
      pickProject(projects, `${caption} ${sale.project ?? ""}`) ??
      (projects.length === 1 ? projects[0]! : remembered && remembered.until > Date.now() ? projects.find((x) => x.id === remembered.id) : undefined);
    if (!p) return { replies: [`कागज़ किस प्रोजेक्ट का है? फ़ोटो के साथ नाम लिखकर दोबारा भेजें:\n${projects.map((x) => `• ${x.name}`).join("\n")}`], ownerAlert: null };
    this.lastProject.set(phone, { id: p.id, until: Date.now() + 30 * 60_000 });
    if (!sale.plot) return { replies: [`${p.name}: कागज़ में प्लाट नंबर नहीं मिला। प्लाट नंबर साफ़ लिखकर दोबारा भेजें।`], ownerAlert: null };

    const plot =
      p.kind === "SHOP"
        ? await this.prisma.colonyPlot.findFirst({ where: { projectId: p.id, plotNo: sale.plot.block ? `${sale.plot.block}-${sale.plot.plotNo}` : sale.plot.plotNo } })
        : await this.prisma.colonyPlot.findFirst({ where: { projectId: p.id, block: sale.plot.block, plotNo: sale.plot.plotNo } });
    const label = plotLabel(sale.plot.block, sale.plot.plotNo);
    if (!plot) return { replies: [`${p.name}: ${label} प्लाट मास्टर में नहीं है। सही प्लाट नंबर लिखकर दोबारा भेजें।`], ownerAlert: null };
    // The same plot's draft from an earlier paper is replaced; anything else on it blocks.
    const existing = await this.prisma.colonySale.findFirst({ where: { plotId: plot.id, status: { not: "CANCELLED" } } });
    if (plot.status === "SOLD" || (existing && (existing.status !== "DRAFT" || existing.source !== "whatsapp"))) {
      return { replies: [`${p.name} ${label} पहले से दर्ज / बिका हुआ है — दोबारा बिक्री नहीं हो सकती। गलती हो तो ऑफिस से बात करें।`], ownerAlert: null };
    }

    // A later paper of the same plot (say only the payment page) fills in; it never wipes what came before.
    const partners = (p.partners as ColonyPartner[]) ?? [];
    const partner = matchPartner(partners, sale.partner) ?? partners.find((x) => x.key === existing?.partnerKey) ?? null;
    const named = sale.buyers.filter((b) => b.name.length >= 2);
    const buyers: BuyerStored[] = named.length ? this.storeBuyers(named) : ((existing?.buyers as BuyerStored[] | undefined) ?? []);
    const consideration = sale.consideration ?? (existing?.consideration || null);
    const instalments = sale.instalments.length ? sale.instalments : ((existing?.instalments as Instalment[] | undefined) ?? []);
    // Unreadable Aadhaar / PAN / payment lines on this paper, then what the merged sale still lacks.
    const unclear = sale.missing.filter((m) => /साफ़ नहीं|भुगतान की एक किश्त/.test(m));
    const missing = [
      ...unclear,
      ...saleGaps({ buyers: buyers.map((b) => ({ name: b.name, guardian: b.guardian, hasAadhaar: !!b.aadhaar })), consideration, instalments }),
      ...(partner ? [] : ["भागीदार (कंपनी की ओर से कौन हस्ताक्षर करेगा)"]),
    ].filter((m, i, a) => a.indexOf(m) === i);
    const data = {
      partnerKey: partner?.key ?? "",
      buyers: buyers as any,
      consideration: consideration ?? 0,
      instalments: instalments as any,
    };
    const row = existing
      ? await this.prisma.colonySale.update({ where: { id: existing.id }, data })
      : await this.prisma.colonySale.create({
          data: { organizationId: p.organizationId, projectId: p.id, number: await this.nextNumber(p.id), plotId: plot.id, source: "whatsapp", ...data },
        });
    await this.prisma.colonyPlot.update({ where: { id: plot.id }, data: { status: "DRAFTED" } });
    this.log.log(`sale #${row.number} from a company paper (${maskPhone(phone)}) missing=${missing.length}`);

    const who = buyers.map((b) => b.name).filter(Boolean).join(", ") || "—";
    const head = `${p.name} — बिक्री #${row.number}: ${label}, क्रेता ${who}, राशि ₹${(consideration ?? 0).toLocaleString("en-IN")}`;
    if (missing.length) {
      return {
        replies: [`📝 ${head} — ड्राफ्ट दर्ज।\nडीड के लिए यह बाकी है:\n${missing.map((m) => `• ${m}`).join("\n")}\n\nपूरा कागज़ दोबारा भेजें (यही बिक्री अपडेट होगी), या ऑफिस वेब पर भरेगा।`],
        ownerAlert: null,
      };
    }
    const checks = await this.checksFor({ ...row, buyers, instalments, partnerKey: partner!.key }, p);
    const errors = checks.filter((c) => c.level === "error");
    if (errors.length || !p.live) {
      const why = !p.live ? ["प्रोजेक्ट अभी लाइव नहीं है (मालिक लाइव करेंगे)"] : errors.map((e) => e.message);
      return { replies: [`📝 ${head} — ड्राफ्ट दर्ज, डीड अभी नहीं बनी:\n${why.map((m) => `• ${m}`).join("\n")}`], ownerAlert: null };
    }
    const creator = await this.deedCreator(p.organizationId);
    if (!creator) return { replies: [`📝 ${head} — ड्राफ्ट दर्ज। डीड ऑफिस वेब से बनेगी।`], ownerAlert: null };
    const made = await this.cls.run(async () => {
      this.cls.set(TENANT_KEY, creator.tenant);
      return this.makeDeed(p, { ...row, buyers, instalments, partnerKey: partner!.key }, creator.user);
    });
    const warnings = checks.filter((c) => c.level === "warning" && c.code !== "notLive").map((c) => `⚠️ ${c.message}`);
    this.log.log(`sale #${made.number}: deed from a company paper`);
    return {
      replies: [`✅ ${head}\nडीड बन गई — ऑफिस जाँचकर रजिस्ट्री की तैयारी करेगा।${warnings.length ? `\n\n${warnings.join("\n")}` : ""}`],
      ownerAlert: `📄 ${p.name}: कंपनी के कागज़ से डीड बनी — बिक्री #${made.number}, ${label}। ऐप में "कॉलोनी डीड" में देखें।${warnings.length ? ` (${warnings.length} चेतावनी)` : ""}`,
    };
  }

  /** Deeds made from WhatsApp are saved in the organization owner's name (DeedTemplate needs a tenant and a creator). */
  private async deedCreator(organizationId: string) {
    const m = await this.prisma.membership.findFirst({
      where: { organizationId, role: "OWNER", status: "ACTIVE" },
      include: { user: { select: { id: true, fname: true, lname: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (!m) return null;
    return {
      tenant: { userId: m.userId, organizationId, membershipId: m.id, role: m.role } as TenantContext,
      user: { id: m.userId, name: `WhatsApp कंपनी (${`${m.user.fname} ${m.user.lname}`.trim()})`, role: "ADMIN" },
    };
  }

  // ---------- company mode (WhatsApp) ----------
  /** Messages from a project's company numbers: plot status, counts, or a sale draft. null for anyone else. */
  async handleCompany(phone: string, text: string): Promise<string[] | null> {
    if (!this.orgId) return null;
    const projects = (await this.prisma.colonyProject.findMany({ where: { organizationId: this.orgId } })).filter((x) =>
      ((x.companyNumbers as string[]) ?? []).includes(phone),
    );
    if (!projects.length) return null;
    // One number may send for several projects: the project's name / alias in the message picks it,
    // else the one this number last wrote about (30 minutes), else ask.
    const named = pickProject(projects, text);
    const remembered = this.lastProject.get(phone);
    const p =
      named ??
      (projects.length === 1 ? projects[0]! : remembered && remembered.until > Date.now() ? projects.find((x) => x.id === remembered.id) : undefined);
    if (!p) {
      return [`यह नंबर ${projects.length} प्रोजेक्ट से जुड़ा है — संदेश में प्रोजेक्ट का नाम लिखें:\n${projects.map((x) => `• ${x.name}`).join("\n")}`];
    }
    this.lastProject.set(phone, { id: p.id, until: Date.now() + 30 * 60_000 });
    if (p.kind === "SHOP") return this.handleCompanyUnits(p, phone, text);
    const s = text.trim();
    const sale = parseCompanySale(s);
    if (sale) {
      if (!sale.plot) return ['प्लाट समझ नहीं आया। पहली पंक्ति ऐसे लिखें: "बिक्री E-47"'];
      const plot = await this.prisma.colonyPlot.findFirst({ where: { projectId: p.id, block: sale.plot.block, plotNo: sale.plot.plotNo } });
      if (!plot) return [`${plotLabel(sale.plot.block, sale.plot.plotNo)} प्लाट मास्टर में नहीं है।`];
      if (plot.status !== "AVAILABLE") return [`${plotLabel(plot.block, plot.plotNo)} पहले से दर्ज / बिका हुआ है — दोबारा बिक्री नहीं हो सकती।`];
      if (!sale.buyer || !sale.amount) return ['क्रेता और राशि लिखें, जैसे:\nबिक्री E-47\nक्रेता: श्याम पुत्र श्री मोहन\nपता: ...\nमोबाइल: ...\nराशि: 1500000\nभागीदार: महेश'];
      const partners = (p.partners as ColonyPartner[]) ?? [];
      const partner = partners.find((x) => x.label === sale.partner || x.key === sale.partner.toLowerCase())?.key ?? "";
      const last = await this.prisma.colonySale.findFirst({ where: { projectId: p.id }, orderBy: { number: "desc" }, select: { number: true } });
      const row = await this.prisma.colonySale.create({
        data: {
          organizationId: p.organizationId,
          projectId: p.id,
          number: (last?.number ?? 0) + 1,
          plotId: plot.id,
          partnerKey: partner,
          buyers: [{ ...sale.buyer, motherName: "", address: sale.address, mobile: sale.mobile, email: "", aadhaar: null, pan: null }] as any,
          consideration: sale.amount,
          instalments: [] as any,
          source: "whatsapp",
        },
      });
      await this.prisma.colonyPlot.update({ where: { id: plot.id }, data: { status: "DRAFTED" } });
      this.log.log(`sale #${row.number} (whatsapp) from ${maskPhone(phone)}`);
      return [
        `✅ बिक्री #${row.number} दर्ज (ड्राफ्ट): ${plotLabel(plot.block, plot.plotNo)}, राशि ₹${sale.amount.toLocaleString("en-IN")}।` +
          `\nआधार, भुगतान की किश्तें${partner ? "" : " और भागीदार"} ऑफिस वेब पर भरेगा, फिर डीड बनेगी।`,
      ];
    }
    if (/^(स्थिति|status|डैशबोर्ड|dashboard|हिसाब)$/i.test(s)) {
      const plots = await this.prisma.colonyPlot.findMany({ where: { projectId: p.id }, select: { status: true } });
      const n = (st: string) => plots.filter((x) => x.status === st).length;
      return [`${p.name}: कुल ${plots.length} प्लाट — उपलब्ध ${n("AVAILABLE")}, ड्राफ्ट ${n("DRAFTED")}, बिके ${n("SOLD")}।`];
    }
    const ref = parsePlotRef(s);
    if (ref && s.length <= 30) {
      const plot = await this.prisma.colonyPlot.findFirst({ where: { projectId: p.id, block: ref.block, plotNo: ref.plotNo } });
      if (!plot) return [`${plotLabel(ref.block, ref.plotNo)} प्लाट मास्टर में नहीं है।`];
      const st = plot.status === "AVAILABLE" ? "उपलब्ध" : plot.status === "DRAFTED" ? "बिक्री दर्ज (डीड बाकी)" : "बिक चुका";
      return [`${p.name} ${plotLabel(plot.block, plot.plotNo)}: ${st}\n${plotBlock(plot)}\n${boundaryBlock(plot)}`];
    }
    return [
      `${p.name} — कंपनी मोड:\n• पूरी बिक्री: क्रेता, आधार, प्लाट, राशि, किश्तें और भागीदार वाला कागज़ (फ़ोटो / PDF) भेजें — डीड अपने आप बनेगी\n• प्लाट देखें: "E-47"\n• कुल स्थिति: "स्थिति"\n• बिक्री दर्ज (लिखकर): पहली पंक्ति "बिक्री E-47", फिर क्रेता:, पता:, मोबाइल:, राशि:, भागीदार:`,
    ];
  }
}

/** The project a company message names (name or an alias, spaces / case ignored). */
export function pickProject<T extends { name: string; aliases?: string | null }>(projects: T[], text: string): T | null {
  const flat = (x: string) => x.toLowerCase().replace(/[\s.-]/g, "");
  const msg = flat(text);
  const full = projects.filter((p) => ColonyService.names(p).some((n) => msg.includes(flat(n))));
  if (full.length === 1) return full[0]!;
  // A distinctive word of the name ("Woods", "Flora") that no other project of this number has.
  const words = (p: T) => ColonyService.names(p).flatMap((n) => n.toLowerCase().split(/\s+/)).filter((w) => w.length >= 4 && !/^(city|colony|business|courtyard|residency|nagar|सिटी|कॉलोनी|नगर)$/.test(w));
  const hits = projects.filter((p) => words(p).some((w) => msg.includes(w) && !projects.some((o) => o !== p && words(o).includes(w))));
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * Checks on what the deed will say (warnings): a boundary that names the very
 * plot / unit being sold, and a maintenance paragraph that appears twice
 * (e.g. one "1 अप्रैल 2026 से", the other "रजिस्ट्री दिनांक से").
 */
export function contentChecks(project: any, plot: any): ColonyCheck[] {
  const out: ColonyCheck[] = [];
  const dir = plot ? boundaryNamesSelf(plot) : null;
  if (dir) out.push({ level: "warning", code: "boundarySelf", message: `चतुःसीमा (${dir}) में वही नंबर (${plot.plotNo}) लिखा है जो बिक रहा है — प्लाट मास्टर में सही पड़ोसी लिखें।` });
  const preview = fillTemplate(project.template ?? "", {
    DEV_PERMISSION: ((project.devPermissions as string[]) ?? []).filter(Boolean).join("\n"),
    MAINTENANCE: ((project.maintenanceClauses as string[]) ?? []).filter(Boolean).join("\n\n"),
  });
  const dup = duplicateClauses(preview);
  if (dup) {
    out.push({
      level: "warning",
      code: "duplicateClause",
      message: `रखरखाव वाला पैरा डीड में दो बार आएगा ("${dup.a}" / "${dup.b}") — मानक टेक्स्ट या रखरखाव शर्तों में से एक हटाएँ।`,
    });
  }
  return out;
}

function safeDecrypt(v: string): string | undefined {
  try {
    return decrypt(v);
  } catch {
    return undefined;
  }
}
function safeMask(v: string): string | null {
  const d = safeDecrypt(v);
  return d ? mask(d) : null;
}
