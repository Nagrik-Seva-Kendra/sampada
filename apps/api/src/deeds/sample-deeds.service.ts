import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DeedType } from "@sampada/shared";
import type {
    CreateCorrectionInput,
    CreateSampleDeedInput,
    DeedCorrectionItem,
    DeedCreator,
    DeedRevisionItem,
    ListDeedsQuery,
    PendingCorrectionSummary,
    PublicDeedItem,
    ResolveCorrectionInput,
    SampleDeedItem,
    SampleDeedListItem,
    SetDeedStarterResult,
    UpdateSampleDeedInput,
} from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";
import type { DeedCorrectionRequest, DeedTemplate, DeedTemplateRevision, Prisma } from "@prisma/client";

function toItem(row: DeedTemplate): SampleDeedItem {
    return {
          id: row.id,
          type: row.type as DeedType,
          title: row.title,
          content: row.content,
          status: row.status as SampleDeedItem["status"],
          createdById: row.createdById,
          createdByName: row.createdByName,
          createdByRole: (row.createdByRole ?? undefined) as SampleDeedItem["createdByRole"],
          createdAt: row.createdAt.toISOString(),
          isStarter: row.isStarter,
    };
}

function toCorrectionItem(row: DeedCorrectionRequest & { resolvedBy?: { fname: string; lname: string } | null }): DeedCorrectionItem {
    return {
          id: row.id,
          message: row.message,
          status: row.status as DeedCorrectionItem["status"],
          resolutionNote: row.resolutionNote,
          resolvedByName: row.resolvedBy ? `${row.resolvedBy.fname} ${row.resolvedBy.lname}`.trim() : null,
          resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
    };
}

function toRevisionItem(row: DeedTemplateRevision): DeedRevisionItem {
    return {
          id: row.id,
          deedId: row.deedId,
          versionNo: row.versionNo,
          title: row.title,
          content: row.content,
          status: row.status as DeedRevisionItem["status"],
          editedById: row.editedById,
          editedByName: row.editedByName,
          createdAt: row.createdAt.toISOString(),
    };
}

/**
 * Every column except `content`. Lists must never select it: one deed body runs
 * to 30KB, so a full deed type (sale-deed: ~5.8k rows) would serialize ~40MB
 * and exhaust the API's memory. Callers fetch the body per-deed via getOne().
 */
const LIST_SELECT = {
    id: true,
    type: true,
    title: true,
    status: true,
    createdById: true,
    createdByName: true,
    createdByRole: true,
    createdAt: true,
    isStarter: true,
} as const;

type ListRow = Pick<DeedTemplate, keyof typeof LIST_SELECT>;

function toListItem(row: ListRow): SampleDeedListItem {
    return {
          id: row.id,
          type: row.type as DeedType,
          title: row.title,
          status: row.status as SampleDeedListItem["status"],
          createdById: row.createdById,
          createdByName: row.createdByName,
          createdByRole: (row.createdByRole ?? undefined) as SampleDeedListItem["createdByRole"],
          createdAt: row.createdAt.toISOString(),
          isStarter: row.isStarter,
    };
}

/** "YYYY-MM-DD" (from a native date input) -> start-of-day UTC Date. */
function startOfDay(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
}

/** "YYYY-MM-DD" (from a native date input) -> end-of-day UTC Date, so the "to" bound is inclusive. */
function endOfDay(dateStr: string): Date {
    return new Date(`${dateStr}T23:59:59.999Z`);
}

/**
 * Keeps prompt size sane for very long real deeds (up to ~30KB): keeps the
 * opening (heading + party listing) and closing (formula + dateline) intact,
 * since those carry the most format signal, and elides the middle.
 */
function truncateExample(content: string, maxLen = 6000): string {
    if (content.length <= maxLen) return content;
    const headLen = Math.floor(maxLen * 0.7);
    const tailLen = maxLen - headLen;
    return (
          content.slice(0, headLen) +
          "\n\n...[बीच का भाग संक्षेप हेतु हटाया गया]...\n\n" +
          content.slice(-tailLen)
        );
}

/**
 * Example deeds shown on a deed-type's public info page. Any staff member
 * (admin or employee) can draft their own; ADMIN additionally sees everyone's.
 * Backed by the DeedTemplate table.
 */
@Injectable()
  export class SampleDeedsService {
    constructor(
          private readonly prisma: PrismaService,
          private readonly cls: ClsService,
    ) {}

  /** ADMIN and EMPLOYEE see every deed of this type; either may draft their own. Newest first. */
  async listByType(type: DeedType, user: StaffUser): Promise<SampleDeedListItem[]> {
        const canViewAll = user.role === "ADMIN" || user.role === "EMPLOYEE";
        const rows = await this.prisma.deedTemplate.findMany({
                where: canViewAll ? { type } : { type, createdById: user.id },
                orderBy: { createdAt: "desc" },
                select: LIST_SELECT,
        });
        return rows.map(toListItem);
  }

/**
     * ADMIN/EMPLOYEE: every sample deed across every type (all creators),
     * newest first, powers the "All Deeds" management page. Filters combine
     * (AND); all are optional. Drops the heavy content body to keep it light.
     */
  async listAll(query: ListDeedsQuery): Promise<SampleDeedListItem[]> {
        const dateFilter: Prisma.DateTimeFilter | undefined =
                query.dateFrom || query.dateTo
            ? {
                          ...(query.dateFrom ? { gte: startOfDay(query.dateFrom) } : {}),
                          ...(query.dateTo ? { lte: endOfDay(query.dateTo) } : {}),
            }
                  : undefined;

      const where: Prisma.DeedTemplateWhereInput = {
              ...(query.types?.length ? { type: { in: query.types } } : {}),
              ...(query.status ? { status: query.status } : {}),
              ...(query.createdById ? { createdById: query.createdById } : {}),
              ...(dateFilter ? { createdAt: dateFilter } : {}),
      };
        const rows = await this.prisma.deedTemplate.findMany({
                where,
                orderBy: { createdAt: "desc" },
                select: LIST_SELECT,
        });
        return rows.map(toListItem);
  }

  /** Every admin/employee account, for the "All Deeds" creator filter dropdown. */
  async listCreators(): Promise<DeedCreator[]> {
        // User is deliberately not a tenant model — one person can belong to
        // several organizations — so the org filter has to be written out here
        // rather than left to the Prisma extension. Without it this listed
        // every staff account on the platform, leaking colleagues' names and
        // usernames into other partners' filter dropdowns.
        const { organizationId } = requireTenantContext(this.cls);
        const rows = await this.prisma.user.findMany({
                where: {
                        role: { in: ["ADMIN", "EMPLOYEE"] },
                        memberships: { some: { organizationId, status: { in: ["ACTIVE", "INACTIVE"] } } },
                },
                select: { id: true, username: true, fname: true, lname: true },
                orderBy: { fname: "asc" },
        });
        return rows.map((r) => ({
                id: r.id,
                name: r.username ?? `${r.fname} ${r.lname}`.trim(),
        }));
  }

  /** Fetch one sample deed (with its full content) by id, or null if absent. */
  async getOne(id: string): Promise<SampleDeedItem | null> {
        const row = await this.prisma.deedTemplate.findUnique({ where: { id } });
        return row ? toItem(row) : null;
  }

  /**
   * Platform staff: mark (or unmark) this deed as a starter — copied into
   * every workspace created from here on.
   *
   * Tenant-scoped like any other update, so staff can only ever promote a
   * deed from their own organization. That is the intended boundary: the
   * starters are the platform's own curated skeletons, not someone else's
   * work handed out to every new partner.
   */
  async setStarter(id: string, isStarter: boolean): Promise<SetDeedStarterResult> {
        const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Deed not found.");
        const row = await this.prisma.deedTemplate.update({ where: { id }, data: { isStarter } });

        const effect = isStarter
          ? { ...(await this.pushStarterToWorkspaces(row)), removedCopies: 0, keptWorkedOnCopies: 0 }
          : { addedCopies: 0, ...(await this.withdrawUnusedCopies(id)) };
        return { deed: toItem(row), ...effect };
  }

  /**
   * Copies a newly marked starter into every existing workspace, so marking
   * one takes effect for the partners who are already here rather than only
   * for whoever signs up next.
   *
   * Skips its own organization (that is where the original lives) and any
   * workspace that already has a copy, so re-marking is harmless. Each copy is
   * attributed to that workspace's own owner, exactly as the copy made at
   * signup is.
   *
   * Unscoped by necessity: the destinations are other organizations.
   */
  private async pushStarterToWorkspaces(starter: DeedTemplate): Promise<{ addedCopies: number }> {
        const db = this.prisma.$unscoped;
        const targets = await db.organization.findMany({
                where: {
                        id: { not: starter.organizationId },
                        status: { not: "CANCELLED" },
                        deeds: { none: { starterSourceId: starter.id } },
                },
                select: {
                        id: true,
                        memberships: {
                                where: { role: "OWNER", status: "ACTIVE" },
                                select: { user: { select: { id: true, fname: true, lname: true } } },
                                orderBy: { createdAt: "asc" },
                                take: 1,
                        },
                },
        });

        const now = new Date();
        const rows = targets.flatMap((org) => {
                const owner = org.memberships[0]?.user;
                // A workspace with no active owner has nobody to attribute the
                // copy to; leave it alone rather than invent an author.
                if (!owner) return [];
                return [
                        {
                                id: randomUUID(),
                                organizationId: org.id,
                                type: starter.type,
                                title: starter.title,
                                content: starter.content,
                                status: "active",
                                createdById: owner.id,
                                createdByName: `${owner.fname} ${owner.lname}`.trim(),
                                createdByRole: "OWNER",
                                createdAt: now,
                                updatedAt: now,
                                isStarter: false,
                                starterSourceId: starter.id,
                        },
                ];
        });

        if (rows.length === 0) return { addedCopies: 0 };
        await db.deedTemplate.createMany({ data: rows });
        return { addedCopies: rows.length };
  }

  /**
   * Deletes the copies of a starter that nobody ever used, and reports how
   * many were left alone.
   *
   * "Never used" is deliberately strict. An unchanged body is not enough:
   * deleting a deed silently cascades its correction requests and property
   * detail away, and orphans its revisions, parties and naksha rows — those
   * carry the deed id as a plain column, with no foreign key to stop it. So a
   * copy only goes if nothing at all hangs off it. Anything a partner has
   * actually worked on stays theirs.
   */
  private async withdrawUnusedCopies(starterId: string): Promise<{ removedCopies: number; keptWorkedOnCopies: number }> {
        const db = this.prisma.$unscoped;
        const copies = await db.deedTemplate.findMany({
                where: { starterSourceId: starterId },
                select: { id: true, createdAt: true, updatedAt: true },
        });
        if (copies.length === 0) return { removedCopies: 0, keptWorkedOnCopies: 0 };

        // Seeding stamps createdAt and updatedAt identically, so any drift
        // between them means the title or body has been edited since.
        const candidates = copies.filter((c) => c.updatedAt.getTime() === c.createdAt.getTime()).map((c) => c.id);
        if (candidates.length === 0) return { removedCopies: 0, keptWorkedOnCopies: copies.length };

        const [revisions, parties, naxas, details, corrections] = await Promise.all([
                db.deedTemplateRevision.findMany({ where: { deedId: { in: candidates } }, select: { deedId: true } }),
                db.deedParty.findMany({ where: { deedId: { in: candidates } }, select: { deedId: true } }),
                db.deedNaxa.findMany({ where: { deedId: { in: candidates } }, select: { deedId: true } }),
                db.deedPropertyDetail.findMany({ where: { deedId: { in: candidates } }, select: { deedId: true } }),
                db.deedCorrectionRequest.findMany({
                        where: { deedTemplateId: { in: candidates } },
                        select: { deedTemplateId: true },
                }),
        ]);
        const worked = new Set<string>([
                ...revisions.map((r) => r.deedId),
                ...parties.map((r) => r.deedId),
                ...naxas.map((r) => r.deedId),
                ...details.map((r) => r.deedId),
                ...corrections.map((r) => r.deedTemplateId),
        ]);

        const removable = candidates.filter((deedId) => !worked.has(deedId));
        if (removable.length > 0) {
                await db.deedTemplate.deleteMany({ where: { id: { in: removable } } });
        }
        return { removedCopies: removable.length, keptWorkedOnCopies: copies.length - removable.length };
  }

  /**
   * Narrows a list of deed ids to the ones the caller can see. Used to filter
   * process-wide state (the live-cursor rooms) down to this tenant before any
   * of it is returned, without loading the deeds themselves.
   */
  async findVisibleIds(ids: string[]): Promise<string[]> {
        if (ids.length === 0) return [];
        const rows = await this.prisma.deedTemplate.findMany({
                where: { id: { in: ids } },
                select: { id: true },
        });
        return rows.map((r) => r.id);
  }

/**
     * Read-only lookup for the party-facing share link: no auth, keyed by the
     * deed's own id (a random UUID, unguessable, the same trust model as a
     * Google Docs share link). Always reflects whatever staff last saved --
     * there is no separate "published" copy, so a correction is visible the
     * moment it's saved. Drops internal bookkeeping fields (createdById/Role)
     * that are of no use to an outside party, and hides inactive/removed deeds.
     */
  async getPublic(id: string): Promise<PublicDeedItem | null> {
        const row = await this.prisma.deedTemplate.findUnique({ where: { id } });
        if (!row || row.status !== "active") return null;
        return {
                id: row.id,
                type: row.type as DeedType,
                title: row.title,
                content: row.content,
                updatedAt: row.updatedAt.toISOString(),
        };
  }

  /** Draft a new deed for a type, owned by the caller. */
  async create(input: CreateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
        const row = await this.prisma.deedTemplate.create({
                data: tenantCreateData<Prisma.DeedTemplateUncheckedCreateInput>({
                          id: randomUUID(),
                          type: input.type,
                          title: input.title,
                          content: input.content,
                          status: "active",
                          createdById: user.id,
                          createdByName: user.name,
                          createdByRole: user.role,
                          createdAt: new Date(),
                }),
        });
        return toItem(row);
  }

/**
                               * Snapshot the deed's current (about-to-be-overwritten) title/content/status
     * into DeedTemplateRevision, numbered one past whatever's already there.
     * Called immediately before any write that changes the body, from both
     * update() and aiDraft(), so the party-facing link (always the live row)
     * and the staff-facing history (every revision that preceded it) stay in
     * sync without a separate background job.
     */
  private async snapshotRevision(existing: DeedTemplate, user: StaffUser): Promise<void> {
        const last = await this.prisma.deedTemplateRevision.findFirst({
                where: { deedId: existing.id },
                orderBy: { versionNo: "desc" },
                select: { versionNo: true },
        });
        await this.prisma.deedTemplateRevision.create({
                data: tenantCreateData<Prisma.DeedTemplateRevisionUncheckedCreateInput>({
                          deedId: existing.id,
                          versionNo: (last?.versionNo ?? 0) + 1,
                          title: existing.title,
                          content: existing.content,
                          status: existing.status,
                          editedById: user.id,
                          editedByName: user.name,
                }),
        });
  }

  /**
     * Version history for one deed, newest first, the staff-facing audit
     * trail of every correction saved before the current one. Same permission
     * model as getOne()/update(): ADMIN/EMPLOYEE see any deed, others only theirs.
     */
  async listRevisions(id: string, user: StaffUser): Promise<DeedRevisionItem[]> {
        const canViewAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
        const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
        if (!existing || (!canViewAny && existing.createdById !== user.id)) {
                throw new NotFoundException("Deed not found.");
        }
        const rows = await this.prisma.deedTemplateRevision.findMany({
                where: { deedId: id },
                orderBy: { versionNo: "desc" },
        });
        return rows.map(toRevisionItem);
  }

/** Edit own deed (ADMIN and EMPLOYEE: any deed). */
  async update(id: string, input: UpdateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
        const canEditAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
        const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
        if (!existing || (!canEditAny && existing.createdById !== user.id)) {
                throw new NotFoundException("Deed not found.");
        }
        const contentChanging = input.content !== undefined && input.content !== existing.content;
        if (contentChanging) {
                await this.snapshotRevision(existing, user);
        }
        const row = await this.prisma.deedTemplate.update({ where: { id }, data: input });
        return toItem(row);
  }

  /** Delete own deed (ADMIN: any deed). EMPLOYEE can never delete. */
  async remove(id: string, user: StaffUser): Promise<void> {
        if (user.role === "EMPLOYEE") {
                throw new ForbiddenException("Employees cannot delete deeds.");
        }
        const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
        if (!existing || (user.role !== "ADMIN" && existing.createdById !== user.id)) {
                throw new NotFoundException("Sample deed not found.");
        }
        await this.prisma.deedTemplate.delete({ where: { id } });
  }

/**
     * AI-assisted drafting: given free-text instructions, ask Claude to write
     * (if the deed is empty) or correct/complete (if it already has a draft)
     * the deed's body, matching this platform's formal legal Hindi drafting
     * style for the deed's type. The generated content is saved immediately,
     * same as a normal edit.
     */
  async aiDraft(
        id: string,
        input: { instructions: string; deedTypeName?: string },
        user: StaffUser,
      ): Promise<SampleDeedItem> {
        const canEditAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
        const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
        if (!existing || (!canEditAny && existing.createdById !== user.id)) {
                throw new NotFoundException("Deed not found.");
        }
        const exampleContent = await this.findExampleContent(existing.type as DeedType, id);
        const content = await this.draftWithClaude(
                input.deedTypeName ?? existing.type,
                existing.content,
                input.instructions,
                exampleContent,
              );
        await this.snapshotRevision(existing, user);
        const row = await this.prisma.deedTemplate.update({ where: { id }, data: { content } });
        return toItem(row);
  }

  /**
     * Finds a real, already-drafted deed of the same type to give Claude as a
     * concrete formatting reference. Picks the most recently created active
     * deed of this type (excluding the one being edited) that actually has
     * content; returns null if none exists yet.
     */
  private async findExampleContent(type: DeedType, excludeId: string): Promise<string | null> {
        const example = await this.prisma.deedTemplate.findFirst({
                where: { type, status: "active", id: { not: excludeId }, NOT: { content: "" } },
                orderBy: { createdAt: "desc" },
                select: { content: true },
        });
        return example?.content.trim() ? example.content : null;
  }

/**
     * Calls the Claude API directly over HTTP (same pattern as the Google
     * Vision OCR call above), no SDK dependency needed. Requires the
     * ANTHROPIC_API_KEY env var; throws a clear error if it's missing so the
     * frontend can show it rather than a generic 500.
     */
  private async draftWithClaude(
        deedTypeName: string,
        existingContent: string,
        instructions: string,
        exampleContent: string | null,
      ): Promise<string> {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) {
                throw new BadRequestException("AI drafting is not set up yet, ANTHROPIC_API_KEY is missing on the server.");
        }
        const trimmedExisting = existingContent.trim();
        const systemPrompt =
                "You are an expert legal drafter specializing in property-registration deeds (registered instruments) " +
                "in Madhya Pradesh, India, in the same style used on this platform. Write ONLY in formal legal Hindi " +
                "(Devanagari script), matching standard Indian conveyancing/deed-drafting conventions for the given deed " +
                "type. Output ONLY the deed's body text as plain paragraphs separated by blank lines -- no markdown, " +
                "no headers, no commentary, no explanations before or after. Follow these house-style rules exactly: " +
                "(1) Party labels: use the correct Hindi legal term for each side of THIS deed type (e.g. sale deed: " +
                "\"विक्रेता पक्ष\" / \"क्रेता पक्ष\"; gift deed: \"दानकर्ता\" / \"दानग्रहीता\"; power of attorney: " +
                "\"नियुक्तकर्ता\" / \"ग्रहिता\"; lease deed: \"पट्टाकर्ता\" / \"पट्टेदार\") -- never use generic " +
                "\"प्रथम पक्ष\"/\"द्वितीय पक्ष\" unless the deed type genuinely has no natural asymmetric roles " +
                "(e.g. partition deed, agreement, settlement among co-parties). (2) Dates: every date must be written " +
                "only in numeric DD.MM.YYYY format (e.g. 15.07.2026) -- never spell out a month name, and never put a " +
                "date in the opening line. The only date in the deed is normally at the very end, in the closing line: " +
                "\"इति [शहर], दिनांक DD.MM.YYYY\". (3) Structure: open directly with the deed-type heading (e.g. " +
                "\"विक्रय पत्र\"), then narrative paragraphs stating the property and parties, listing each party " +
                "numbered (1., 2., ...) with parentage and Aadhaar reference where given, and close with the standard " +
                "\"अतएव यह लिखतम् ... सम्पादित कर दिया ... सनद् रहे व वक्त जरूरत काम आवें।\" formula before the " +
                "final dateline. (4) If a real example deed from this platform is given below, treat it as the " +
                "authoritative reference for exact wording conventions, party-listing style, and structure -- match " +
                "it as closely as possible, even where it differs slightly from the general rules above.";

      const exampleSection = exampleContent
          ? "Here is a REAL, already-approved deed of the exact same type from this platform -- use it as your " +
                "primary reference for exact formatting, party-listing style, wording conventions, and closing/date " +
                "format (the written rules above are a fallback for anything this example doesn't show):\n\"\"\"\n" +
                truncateExample(exampleContent) +
                "\n\"\"\"\n\n"
              : "";
        const userPrompt = trimmedExisting
          ? exampleSection +
                  "Deed type: " +
                  deedTypeName +
                  "\n\nExisting draft (correct/complete it per the instructions below; keep the same legal Hindi format and style):\n\"\"\"\n" +
                  trimmedExisting +
                  "\n\"\"\"\n\nInstructions:\n" +
                  instructions
                : exampleSection +
                  "Deed type: " +
                  deedTypeName +
                  "\n\nThere is no existing draft. Write a complete new deed matching the standard legal Hindi drafting format used for this deed type in Madhya Pradesh, based on these instructions:\n" +
                  instructions;
        const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                          "content-type": "application/json",
                          "x-api-key": key,
                          "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                          model: "claude-sonnet-5",
                          max_tokens: 8192,
                          system: systemPrompt,
                          messages: [{ role: "user", content: userPrompt }],
                }),
        });
        const raw = await res.text();
        if (!res.ok) {
                throw new BadRequestException("AI drafting failed: HTTP " + res.status + ": " + raw.slice(0, 300));
        }
        const data = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> };
        const text = data.content?.find((b) => b.type === "text")?.text?.trim();
        if (!text) throw new BadRequestException("AI drafting returned no content.");
        return text;
  }

  /**
   * Party-facing auto-fill: replaces {{token}} placeholders (e.g.
   * {{sellerName}}, {{buyerName}}, {{propertyDetails}}) that staff typed into
   * the deed's content with values submitted from the legacy paper-form
   * share link. No auth -- gated only by the deed's own unguessable id, same
   * as getPublic(). A token that's already been replaced (or was never
   * present) is left alone, so a later resubmission of the same field is a
   * harmless no-op rather than an error -- edits made by the party AFTER a
   * token has been consumed won't retroactively update the deed.
   */
  async applyPartyFields(id: string, fields: Record<string, string>): Promise<{ changed: boolean }> {
    const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
    if (!existing || existing.status !== "active") throw new NotFoundException("Deed not found.");
    let content = existing.content;
    for (const [key, value] of Object.entries(fields)) {
      
      const token = `{{${key}}}`;
      if (content.includes(token)) {
        content = content.split(token).join(value || '..................');
      }
    }
    if (content === existing.content) return { changed: false };
    const last = await this.prisma.deedTemplateRevision.findFirst({
      where: { deedId: existing.id },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true },
    });
    await this.prisma.deedTemplateRevision.create({
      data: tenantCreateData<Prisma.DeedTemplateRevisionUncheckedCreateInput>({
        deedId: existing.id,
        versionNo: (last?.versionNo ?? 0) + 1,
        title: existing.title,
        content: existing.content,
        status: existing.status,
        editedById: null,
        editedByName: "Party (form submission)",
      }),
    });
    await this.prisma.deedTemplate.update({ where: { id }, data: { content } });
    return { changed: true };
  }

  /**
   * Party-facing: flags something wrong with the deed, from the public share
   * link. No auth -- gated only by the deed's own unguessable id, same as
   * getPublic()/applyPartyFields(). Rejected on an inactive/removed deed so a
   * stale link can't spawn corrections nobody will ever see.
   */
  async createCorrection(deedId: string, input: CreateCorrectionInput): Promise<DeedCorrectionItem> {
    const deed = await this.prisma.deedTemplate.findUnique({ where: { id: deedId } });
    if (!deed || deed.status !== "active") throw new NotFoundException("Deed not found.");
    const row = await this.prisma.deedCorrectionRequest.create({
      data: tenantCreateData<Prisma.DeedCorrectionRequestUncheckedCreateInput>({
        deedTemplateId: deedId,
        message: input.message,
      }),
    });
    return toCorrectionItem(row);
  }

  /**
   * Every correction on this deed, newest first -- shown both on the public
   * share link (so the party can see their own report's status) and to staff
   * editing the deed.
   */
  async listCorrections(deedId: string): Promise<DeedCorrectionItem[]> {
    const rows = await this.prisma.deedCorrectionRequest.findMany({
      where: { deedTemplateId: deedId },
      orderBy: { createdAt: "desc" },
      include: { resolvedBy: { select: { fname: true, lname: true } } },
    });
    return rows.map(toCorrectionItem);
  }

  /**
   * The set of deed ids with at least one PENDING correction, across every
   * deed -- powers the "flagged" badge on the All Deeds list so staff notice
   * without opening each deed individually.
   */
  async listPendingCorrectionDeedIds(): Promise<string[]> {
    const rows = await this.prisma.deedCorrectionRequest.findMany({
      where: { status: "PENDING" },
      select: { deedTemplateId: true },
      distinct: ["deedTemplateId"],
    });
    return rows.map((r) => r.deedTemplateId);
  }

  /**
   * Every pending correction across every deed, newest first, with just
   * enough deed context to power the notification bell (title + type, so
   * the dropdown can link straight into the editor).
   */
  async listPendingCorrections(): Promise<PendingCorrectionSummary[]> {
    const rows = await this.prisma.deedCorrectionRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { deedTemplate: { select: { id: true, type: true, title: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      deedId: r.deedTemplate.id,
      deedType: r.deedTemplate.type as DeedType,
      deedTitle: r.deedTemplate.title,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Staff: marks a correction resolved (ADMIN/EMPLOYEE, same as editing the deed itself). */
  async resolveCorrection(correctionId: string, input: ResolveCorrectionInput, user: StaffUser): Promise<DeedCorrectionItem> {
    const existing = await this.prisma.deedCorrectionRequest.findUnique({ where: { id: correctionId } });
    if (!existing) throw new NotFoundException("Correction not found.");
    const row = await this.prisma.deedCorrectionRequest.update({
      where: { id: correctionId },
      data: {
        status: "RESOLVED",
        resolutionNote: input.resolutionNote ?? null,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
      include: { resolvedBy: { select: { fname: true, lname: true } } },
    });
    return toCorrectionItem(row);
  }
}
