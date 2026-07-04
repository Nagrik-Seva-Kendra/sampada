import { z } from "zod";

/** Guideline (collector) rate PDFs start at 2015 and run to the current year. */
export const GUIDELINE_START_YEAR = 2015;

/** All valid guideline years, 2015 → current year (inclusive), descending. */
export function guidelineYears(now: Date = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = current; y >= GUIDELINE_START_YEAR; y--) years.push(y);
  return years;
}

export const GuidelineYear = z.coerce
  .number()
  .int()
  .min(GUIDELINE_START_YEAR)
  .max(new Date().getFullYear() + 1);

/** District name for a guideline PDF (free text; MP has 50+ districts). */
export const District = z.string().trim().min(1).max(80);

/** An uploaded guideline PDF document. */
export const GuidelineDocItem = z.object({
  id: z.string(),
  year: z.number().int(),
  district: z.string(),
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
