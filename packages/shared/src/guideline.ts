import { z } from "zod";
import { Language } from "./enums.js";

/** Guideline (collector) rate PDFs start with the 2015-2016 session. */
export const GUIDELINE_START_YEAR = 2015;

/**
 * Registration sessions run 1 April → 31 March (not the calendar year), so a
 * session is identified by its starting year: 2015 means "2015-2016". Before
 * April 1st the current session is still last year's.
 */
export function currentSessionStartYear(now: Date = new Date()): number {
  const isBeforeApril = now.getMonth() < 3; // Jan(0)-Mar(2)
  return now.getFullYear() - (isBeforeApril ? 1 : 0);
}

/** All valid session-start years, 2015 → current session (inclusive), descending. */
export function guidelineYears(now: Date = new Date()): number[] {
  const current = currentSessionStartYear(now);
  const years: number[] = [];
  for (let y = current; y >= GUIDELINE_START_YEAR; y--) years.push(y);
  return years;
}

/** Display label for a session-start year, e.g. 2015 → "2015-2016". */
export function formatGuidelineSession(year: number): string {
  return `${year}-${year + 1}`;
}

export const GuidelineYear = z.coerce
  .number()
  .int()
  .min(GUIDELINE_START_YEAR)
  .max(currentSessionStartYear() + 1);

/** District name for a guideline PDF (free text; MP has 50+ districts). */
export const District = z.string().trim().min(1).max(80);

/** An uploaded guideline PDF document. Each district+year can have an EN and/or HI copy. */
export const GuidelineDocItem = z.object({
  id: z.string(),
  year: z.number().int(),
  district: z.string(),
  language: Language,
  fileName: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.string(), // ISO timestamp
  url: z.string(), // path to view/download the PDF
});
export type GuidelineDocItem = z.infer<typeof GuidelineDocItem>;

/** Per-year coverage info for the year selector. */
export const GuidelineYearInfo = z.object({
  year: z.number().int(),
  count: z.number().int(),
});
export type GuidelineYearInfo = z.infer<typeof GuidelineYearInfo>;
