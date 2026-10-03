import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
  type Instalment,
} from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
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
    if (((p.devPermissions as string[]) ?? []).filter((x) => x.trim()).length < 2) out.push("दोनों विकास अनुमति के संदर्भ भरें।");
    if (((p.maintenanceClauses as string[]) ?? []).filter((x) => x.trim()).length < 2) out.push("दोनों रखरखाव शर्तें भरें।");
    if (!(await this.prisma.colonyPlot.count({ where: { projectId: p.id } }))) out.push("प्लाट मास्टर (Excel/CSV) आयात करें।");
    return out;
  }

  private async projectItem(p: any): Promise<ColonyProject> {
    return {
      id: p.id,
      name: p.name,
      village: p.village,
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

  async create(input: ColonyProjectInput): Promise<ColonyProject> {
    const t = this.manager();
    if (await this.prisma.colonyProject.findFirst({ where: { organizationId: t.organizationId, name: input.name } })) {
      throw new BadRequestException("इस नाम का प्रोजेक्ट पहले से है।");
    }
    const row = await this.prisma.colonyProject.create({ data: { organizationId: t.organizationId, ...this.projectData(input) } });
    this.log.log(`project created: ${row.name}`);
    return this.projectItem(row);
  }

  async update(id: string, input: ColonyProjectInput): Promise<ColonyProject> {
    const t = this.manager();
    await this.project(id, t.organizationId);
    const row = await this.prisma.colonyProject.update({ where: { id }, data: this.projectData(input) });
    return this.projectItem(row);
  }

  private projectData(i: ColonyProjectInput) {
    return {
      name: i.name,
      village: i.village,
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
      .map((r) => ({ id: r.id, block: r.block, plotNo: r.plotNo, ewFt: r.ewFt, nsFt: r.nsFt, areaSqft: r.areaSqft, east: r.east, west: r.west, north: r.north, south: r.south, status: r.status as ColonyPlot["status"] }))
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
      guidelineRatePerSqm: project.guidelineRatePerSqm,
      otherSaleOfPlot: !!other,
      plotSold: plot?.status === "SOLD",
    });
    if (!((project.partners as ColonyPartner[]) ?? []).some((p) => p.key === sale.partnerKey)) {
      checks.push({ level: "error", code: "partner", message: "भागीदार चुनें।" });
    }
    if (!project.live) checks.push({ level: "warning", code: "notLive", message: "प्रोजेक्ट अभी लाइव नहीं — डीड मालिक के लाइव करने के बाद बनेगी।" });
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
    const plot = (await this.prisma.colonyPlot.findFirst({ where: { id: s.plotId } }))!;
    const partner = ((p.partners as ColonyPartner[]) ?? []).find((x) => x.key === s.partnerKey)!;
    const content = fillTemplate(p.template, {
      BUYER: buyerBlock(
        buyers.map((b) => ({ ...b, aadhaar: "", pan: "", aadhaarText: b.aadhaar ? safeDecrypt(b.aadhaar) : undefined, panText: b.pan ? safeDecrypt(b.pan) : undefined })),
      ),
      PLOT: plotBlock(plot),
      BOUNDARY: boundaryBlock(plot),
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
        createdById: user.id,
        createdByName: user.name,
        createdByRole: user.role,
        createdAt: new Date(),
      }),
    });
    const row = await this.prisma.colonySale.update({ where: { id: s.id }, data: { status: "DEED_CREATED", deedId } });
    await this.prisma.colonyPlot.update({ where: { id: plot.id }, data: { status: "SOLD" } });
    this.log.log(`sale #${s.number}: deed created`);
    return this.saleItem(row, p);
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

  // ---------- company mode (WhatsApp) ----------
  /** Messages from a project's company numbers: plot status, counts, or a sale draft. null for anyone else. */
  async handleCompany(phone: string, text: string): Promise<string[] | null> {
    if (!this.orgId) return null;
    const projects = await this.prisma.colonyProject.findMany({ where: { organizationId: this.orgId } });
    const p = projects.find((x) => ((x.companyNumbers as string[]) ?? []).includes(phone));
    if (!p) return null;
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
    return [`${p.name} — कंपनी मोड:\n• प्लाट देखें: "E-47"\n• कुल स्थिति: "स्थिति"\n• बिक्री दर्ज: पहली पंक्ति "बिक्री E-47", फिर क्रेता:, पता:, मोबाइल:, राशि:, भागीदार:`];
  }
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
