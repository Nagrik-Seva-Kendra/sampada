import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DeedType } from "@sampada/shared";
import type {
  CreateSampleDeedInput,
  DeedCreator,
  ListDeedsQuery,
  SampleDeedItem,
  SampleDeedListItem,
  UpdateSampleDeedInput,
} from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { DeedTemplate, Prisma } from "@prisma/client";

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
} as const;

type ListRow = Omit<DeedTemplate, "content" | "updatedAt">;

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
  constructor(private readonly prisma: PrismaService) {}

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
   * newest first — powers the "All Deeds" management page. Filters combine
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

  /** Every admin/employee account, for the "All Deeds" creator filter dropdown (regardless of whether they've drafted anything yet). */
  async listCreators(): Promise<DeedCreator[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLOYEE"] } },
      select: { id: true, username: true, fname: true, lname: true },
      orderBy: { fname: "asc" },
    });
    // Label by username (e.g. "admin") so the dropdown matches what the deed's
    // User column shows; fall back to the full name for accounts without one.
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

  /** Draft a new deed for a type, owned by the caller. */
  async create(input: CreateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
    const row = await this.prisma.deedTemplate.create({
      data: {
        id: randomUUID(),
        type: input.type,
        title: input.title,
        content: input.content,
        status: "active",
        createdById: user.id,
        createdByName: user.name,
        createdByRole: user.role,
        createdAt: new Date(),
      },
    });
    return toItem(row);
  }

  /** Edit own deed (ADMIN and EMPLOYEE: any deed). */
  async update(id: string, input: UpdateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
    const canEditAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
    if (!existing || (!canEditAny && existing.createdById !== user.id)) {
      throw new NotFoundException("Deed not found.");
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
   * the deed's body — matching this platform's formal legal Hindi drafting
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
    const row = await this.prisma.deedTemplate.update({ where: { id }, data: { content } });
    return toItem(row);
  }

  /**
   * Finds a real, already-drafted deed of the same type to give Claude as a
   * concrete formatting reference -- closer to matching our actual house
   * style than relying on written rules alone. Picks the most recently
   * created active deed of this type (excluding the one being edited) that
   * actually has content; returns null if none exists yet.
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
   * Vision OCR call above) — no SDK dependency needed. Requires the
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
      throw new BadRequestException("AI drafting is not set up yet — ANTHROPIC_API_KEY is missing on the server.");
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
      "\"अतएव यह लिखतम् ... सम्‍पादित कर दिया ... सनद् रहे व वक्‍त जरूरत काम आवें।\" formula before the " +
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

}
