import type { DeedPropertyDetailCreateInput } from "@sampada/shared";

export type NakshaLang = "hi" | "en";

const LABELS: Record<NakshaLang, { east: string; west: string; north: string; south: string }> = {
  hi: { east: "पूर्व में", west: "पश्चिम में", north: "उत्तर में", south: "दक्षिण में" },
  en: { east: "East", west: "West", north: "North", south: "South" },
};

/**
 * Renders the four chauhaddi lines in deed-document order (East, West,
 * North, South — matching the existing deed template convention), one per
 * line, e.g. "पूर्व में : Plot 14".
 */
export function buildBoundaryText(
  d: Pick<DeedPropertyDetailCreateInput, "boundaries">,
  lang: NakshaLang,
): string {
  const l = LABELS[lang];
  const { boundaries } = d;
  return [
    `${l.east} : ${boundaries.east}`,
    `${l.west} : ${boundaries.west}`,
    `${l.north} : ${boundaries.north}`,
    `${l.south} : ${boundaries.south}`,
  ].join("\n");
}
