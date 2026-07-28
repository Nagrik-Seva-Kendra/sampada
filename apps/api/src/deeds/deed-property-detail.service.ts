import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AreaUnit,
  DeedPropertyDetail,
  DeedPropertyDetailCreateInput,
  DeedPropertyDetailExtraction,
  LengthUnit,
} from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";
import {
  buildExtractionUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionParseError,
  parseExtractionResponse,
} from "./deed-property-extraction.core.js";

/** Property details are almost always stated early in the deed; capping keeps the AI call fast and cheap. */
const MAX_EXTRACTION_CONTENT_LEN = 12000;

type Row = Prisma.DeedPropertyDetailGetPayload<Record<string, never>>;

function toApi(row: Row): DeedPropertyDetail {
  return {
    id: row.id,
    deedId: row.deedId,
    plotNo: row.plotNo ?? undefined,
    block: row.block ?? undefined,
    location: row.location,
    sellerName: row.sellerName ?? undefined,
    buyerName: row.buyerName ?? undefined,
    shape: "rectangle",
    ewLength: row.ewLength.toNumber(),
    nsLength: row.nsLength.toNumber(),
    unit: row.unit as LengthUnit,
    statedArea: row.statedArea?.toNumber(),
    statedAreaUnit: (row.statedAreaUnit as AreaUnit | null) ?? undefined,
    boundaries: {
      north: row.boundaryNorth,
      south: row.boundarySouth,
      east: row.boundaryEast,
      west: row.boundaryWest,
    },
    source: row.source as "manual" | "extracted",
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    verifiedBy: row.verifiedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Structured property data attached to a deed — the source of truth for both
 * the deed's rendered boundary text and the auto-generated naksha (see
 * @sampada/naksha-render). At most one row per deed; PUT upserts it. Tenant
 * isolation and the deletedAt soft-delete filter are enforced automatically
 * by the Prisma tenant-scope extension (see prisma/tenant-scope.core.ts).
 */
@Injectable()
export class DeedPropertyDetailService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns null (not a 404) when the deed simply has no property detail yet. */
  async get(deedId: string): Promise<DeedPropertyDetail | null> {
    const row = await this.prisma.deedPropertyDetail.findUnique({ where: { deedId } });
    return row ? toApi(row) : null;
  }

  async upsert(deedId: string, input: DeedPropertyDetailCreateInput): Promise<DeedPropertyDetail> {
    const deed = await this.prisma.deedTemplate.findUnique({ where: { id: deedId }, select: { id: true } });
    if (!deed) throw new NotFoundException("Deed not found.");

    const data = {
      plotNo: input.plotNo,
      block: input.block,
      location: input.location,
      sellerName: input.sellerName,
      buyerName: input.buyerName,
      shape: input.shape,
      ewLength: input.ewLength,
      nsLength: input.nsLength,
      unit: input.unit,
      statedArea: input.statedArea,
      statedAreaUnit: input.statedAreaUnit,
      boundaryNorth: input.boundaries.north,
      boundarySouth: input.boundaries.south,
      boundaryEast: input.boundaries.east,
      boundaryWest: input.boundaries.west,
    };

    const row = await this.prisma.deedPropertyDetail.upsert({
      where: { deedId },
      create: tenantCreateData<Prisma.DeedPropertyDetailUncheckedCreateInput>({ deedId, ...data }),
      update: data,
    });
    return toApi(row);
  }

  async remove(deedId: string): Promise<void> {
    const row = await this.prisma.deedPropertyDetail.findUnique({ where: { deedId }, select: { id: true } });
    if (!row) throw new NotFoundException("No property detail saved for this deed.");
    await this.prisma.deedPropertyDetail.update({ where: { deedId }, data: { deletedAt: new Date() } });
  }

  /**
   * Reads the deed's own free-text content with Claude and returns a
   * best-effort structured reading of it, to pre-fill the property-detail
   * form. Deed phrasing varies too much across authors/eras for a fixed
   * regex to hold up — an LLM reading the text like a person would handles
   * that variation without a new rule per phrasing (same approach as
   * SampleDeedsService.aiDraft, just reading instead of writing).
   *
   * Never writes anything — the result is a suggestion the caller must let
   * staff review and correct before saving, same as the rest of this form.
   */
  async extractFromDeedText(deedId: string): Promise<DeedPropertyDetailExtraction> {
    const deed = await this.prisma.deedTemplate.findUnique({ where: { id: deedId }, select: { content: true } });
    if (!deed) throw new NotFoundException("Deed not found.");
    const content = deed.content.trim();
    if (!content) throw new BadRequestException("This deed has no text yet to extract from.");

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new BadRequestException("AI extraction is not set up yet, ANTHROPIC_API_KEY is missing on the server.");
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildExtractionUserPrompt(content.slice(0, MAX_EXTRACTION_CONTENT_LEN)) }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new BadRequestException(`AI extraction failed: HTTP ${res.status}: ${raw.slice(0, 300)}`);
    }
    const data = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim();
    if (!text) throw new BadRequestException("AI extraction returned no content.");

    try {
      return parseExtractionResponse(text);
    } catch (err) {
      if (err instanceof ExtractionParseError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
