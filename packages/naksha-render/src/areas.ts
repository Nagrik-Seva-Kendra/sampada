import type { DeedPropertyDetailCreateInput, AreaUnit, LengthUnit } from "@sampada/shared";

const FT_PER_M = 1 / 0.3048;
const SQM_TO_SQFT = 10.76391042;

function toFeet(value: number, unit: LengthUnit): number {
  return unit === "m" ? value * FT_PER_M : value;
}

function toSqft(area: number, unit: AreaUnit): number {
  return unit === "sqm" ? area * SQM_TO_SQFT : area;
}

export interface Areas {
  sqft: number;
  sqm: number;
}

/** Computes the plot's area in sqft/sqm from its E-W/N-S measurements. */
export function computeAreas(d: Pick<DeedPropertyDetailCreateInput, "ewLength" | "nsLength" | "unit">): Areas {
  const ewFt = toFeet(d.ewLength, d.unit);
  const nsFt = toFeet(d.nsLength, d.unit);
  const sqft = ewFt * nsFt;
  return { sqft, sqm: sqft / SQM_TO_SQFT };
}

export interface AreaMismatch {
  computedSqft: number;
  statedSqft: number | null;
  diffPercent: number | null;
  ok: boolean;
}

/**
 * Compares the computed area (from measurements) against the area optionally
 * stated in the document text. `ok` is false when they diverge by more than
 * 2% — a non-blocking signal for the deed form to show a warning, since the
 * document's stated figure is sometimes simply wrong.
 */
export function checkAreaMismatch(
  d: Pick<DeedPropertyDetailCreateInput, "ewLength" | "nsLength" | "unit" | "statedArea" | "statedAreaUnit">,
): AreaMismatch {
  const { sqft: computedSqft } = computeAreas(d);
  if (d.statedArea == null || !d.statedAreaUnit) {
    return { computedSqft, statedSqft: null, diffPercent: null, ok: true };
  }
  const statedSqft = toSqft(d.statedArea, d.statedAreaUnit);
  const diffPercent = ((statedSqft - computedSqft) / computedSqft) * 100;
  return { computedSqft, statedSqft, diffPercent, ok: Math.abs(diffPercent) <= 2 };
}
