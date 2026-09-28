import { Injectable } from "@nestjs/common";
import type { DeedProperty } from "./deed-extractor.service.js";

export interface GuidelineResult {
  year: string; // e.g. "2026-27"
  matchedLocality: string; // location row that matched in the rate table
  ratePerUnit: number;
  unit: string; // "वर्ग मीटर" / "हेक्टेयर"
  area: number; // in the same unit
  marketValue: number;
}

/**
 * Guideline (collector rate) lookup for the WhatsApp bot.
 *
 * TODO: port the office's own HTML guideline calculator logic here exactly
 * (rate table + unit conversions + sub-clauses), with unit tests built from real
 * archived deeds. Until then this returns null, and the bot hands the case to
 * staff instead of guessing a rate.
 */
@Injectable()
export class GuidelineLookupService {
  async lookup(_p: DeedProperty): Promise<GuidelineResult | null> {
    return null;
  }
}
