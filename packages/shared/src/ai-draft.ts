import { z } from "zod";

/**
 * "AI से पूरा ड्राफ्ट": a deed drafted from the office's own archive of the
 * same deed type and property type. OFF for every property type until its
 * eval score reaches the threshold and the owner switches it on.
 */
export const AiPropertyType = z.enum(["plot", "building", "agricultural", "flat"]);
export type AiPropertyTypeT = z.infer<typeof AiPropertyType>;

export interface AiDraftSettings {
  enabled: Record<AiPropertyTypeT, boolean>;
  /** Eval pass rate needed before a type may be switched on (0.95). */
  threshold: number;
  /** Latest finished eval per type (score 0..1), null when never run. */
  lastEval: Record<AiPropertyTypeT, { score: number; total: number; finishedAt: string } | null>;
  starred: { deedId: string; title: string; propertyType: string | null }[];
  model: string;
  canManage: boolean;
}

export const AiDraftToggleInput = z.object({ propertyType: AiPropertyType, enabled: z.boolean() }).strict();
export const AiStarInput = z.object({ deedId: z.string().trim().min(1).max(64), starred: z.boolean() }).strict();
export const AiEvalStartInput = z.object({ propertyType: AiPropertyType, deedType: z.enum(["sale-deed", "equitable-mortgage-deed"]).default("sale-deed") }).strict();

export interface AiExampleUsed {
  deedId: string;
  title: string;
  score: number;
  /** Why it was chosen ("वही वार्ड", "वही तहसील", "आदर्श डीड ★"). */
  reason: string;
}

export interface AiFactShown {
  label: string;
  /** Aadhaar/PAN masked to the last 4 here. */
  value: string;
  source: string;
  found: boolean;
}

export interface AiDraftRunItem {
  id: string;
  status: "OK" | "BLOCKED_LEAK" | "NO_EXAMPLES" | "FAILED";
  deedId: string | null;
  deedType: string;
  propertyType: string;
  model: string;
  examples: AiExampleUsed[];
  facts: AiFactShown[];
  issues: { code: string; message: string }[];
  reviewIssues: string[];
  flags: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

/** On the request page: whether the button shows, and why not. */
export interface AiDraftAvailability {
  allowed: boolean;
  /** "notSupported" | "typeOff" | "notAllowed" | "noKey" | null */
  reason: string | null;
  propertyType: AiPropertyTypeT | null;
  runs: AiDraftRunItem[];
  /** The latest AI deed's review state: REVIEW_PENDING | REVIEWED. */
  deedStatus: string | null;
  /** OWNER may star the examples used. */
  canStar: boolean;
}

export interface AiEvalItem {
  id: string;
  deedType: string;
  propertyType: string;
  status: "RUNNING" | "DONE" | "FAILED";
  total: number;
  done: number;
  passed: number;
  score: number | null;
  costUsd: number;
  /** Per deed: pass, and what failed (no personal data). */
  details: { deedId: string; pass: boolean; problems: string[] }[];
  startedAt: string;
  finishedAt: string | null;
}
