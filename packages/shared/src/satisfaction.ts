import { z } from "zod";

/** Customer satisfaction: review link, correction-deed policy, rating timing; and the results. */
export const SatisfactionSettingsInput = z
  .object({
    /** Google review link sent to 4-5 star ratings (https only; empty = none). */
    reviewUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v), "https link"),
    correctionPolicy: z.string().trim().min(20).max(1500),
    /** Hours after DONE before the rating question. */
    ratingDelayHours: z.number().int().min(1).max(168),
    ratingsEnabled: z.boolean(),
  })
  .strict();
export type SatisfactionSettingsInput = z.infer<typeof SatisfactionSettingsInput>;

export interface SatisfactionSettings extends SatisfactionSettingsInput {
  canManage: boolean;
  stats: { asked: number; rated: number; average: number | null; low: number; corrections: number };
  /** Latest low ratings with feedback (masked phone). */
  lowRatings: { requestId: string; ref: string; rating: number; feedback: string | null; at: string }[];
}

export interface WaSatisfaction {
  rating: number | null;
  ratingAt: string | null;
  feedback: string | null;
  corrections: { text: string; at: string }[];
  packetSentAt: string | null;
}
