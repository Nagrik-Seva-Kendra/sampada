import { maskArchive } from "./archive-text.js";

/**
 * Learning from staff edits to AI drafts: a line diff between the model's
 * draft and the reviewed deed, turned into masked "write X instead of Y"
 * suggestions. Only wording changes count -- a line whose difference is just
 * personal data (names, numbers ...) is a fact correction, not a rule.
 */

/** LCS line diff → changed hunks as paired lines (removed[i] ↔ added[i]). */
export function lineDiff(a: string[], b: string[]): { removed: string[]; added: string[] }[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const hunks: { removed: string[]; added: string[] }[] = [];
  let cur: { removed: string[]; added: string[] } | null = null;
  let i = 0;
  let j = 0;
  const flush = () => {
    if (cur && (cur.removed.length || cur.added.length)) hunks.push(cur);
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      (cur ??= { removed: [], added: [] }).added.push(b[j]!);
      j++;
    } else {
      (cur ??= { removed: [], added: [] }).removed.push(a[i]!);
      i++;
    }
  }
  flush();
  return hunks;
}

const lines = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Share of lines the staff changed (0..1). */
export function editRatio(original: string, final: string): number {
  const a = lines(original);
  const b = lines(final);
  if (!a.length && !b.length) return 0;
  const changed = lineDiff(a, b).reduce((s, h) => s + Math.max(h.removed.length, h.added.length), 0);
  return Math.min(1, Math.round((changed / Math.max(a.length, b.length)) * 1000) / 1000);
}

/** Masks personal data and the remaining digits / tokens so a suggestion never carries a customer's data. */
export function generalize(line: string): string {
  return maskArchive(line)
    .text.replace(/\[\[[A-Z]+_\d+\]\]/g, "[आधार]")
    .replace(/[\d०-९][\d०-९,./-]*/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Suggestion {
  before: string;
  after: string;
}

/** Wording changes (masked) from one reviewed draft; at most 20, each line ≤ 300 chars. */
export function suggestionsFrom(original: string, final: string): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const h of lineDiff(lines(original), lines(final))) {
    const pairs = Math.max(h.removed.length, h.added.length);
    for (let k = 0; k < pairs; k++) {
      const before = generalize(h.removed[k] ?? "");
      const after = generalize(h.added[k] ?? "");
      if (before === after) continue; // only personal data changed
      if (!after || before.length > 300 || after.length > 300) continue; // deleted lines and long rewrites are not rules
      const key = `${before}\u0000${after}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ before, after });
      if (out.length >= 20) return out;
    }
  }
  return out;
}

/** Prompt section for the owner-approved rules. */
export function rulesPrompt(rules: Suggestion[]): string[] {
  if (!rules.length) return [];
  return [
    "Office rules learned from staff corrections (approved by the owner) -- follow them:",
    ...rules.map((r) => (r.before ? `- Instead of «${r.before}» write «${r.after}»` : `- Add: «${r.after}»`)),
  ];
}
