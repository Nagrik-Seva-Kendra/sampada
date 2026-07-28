import { describe, it, expect } from "vitest";
import { computeAreas, checkAreaMismatch } from "./areas.js";

describe("computeAreas", () => {
  it("computes a square plot in feet", () => {
    const areas = computeAreas({ ewLength: 30, nsLength: 30, unit: "ft" });
    expect(areas.sqft).toBe(900);
    expect(areas.sqm).toBeCloseTo(900 / 10.76391042, 6);
  });

  it("computes a rectangle plot in feet", () => {
    const areas = computeAreas({ ewLength: 40, nsLength: 60, unit: "ft" });
    expect(areas.sqft).toBe(2400);
  });

  it("converts meter measurements to feet before computing area", () => {
    const areas = computeAreas({ ewLength: 10, nsLength: 10, unit: "m" });
    // 10m = 32.8084ft, area = 1076.391... sqft
    expect(areas.sqft).toBeCloseTo(1076.391, 2);
    expect(areas.sqm).toBeCloseTo(100, 6);
  });
});

describe("checkAreaMismatch", () => {
  it("returns ok:true with nulls when no stated area is given", () => {
    const result = checkAreaMismatch({ ewLength: 30, nsLength: 30, unit: "ft" });
    expect(result.statedSqft).toBeNull();
    expect(result.diffPercent).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.computedSqft).toBe(900);
  });

  it("flags ok:false when stated area diverges by more than 2%", () => {
    const result = checkAreaMismatch({
      ewLength: 30,
      nsLength: 30,
      unit: "ft",
      statedArea: 1000,
      statedAreaUnit: "sqft",
    });
    expect(result.computedSqft).toBe(900);
    expect(result.statedSqft).toBe(1000);
    expect(result.diffPercent).toBeCloseTo(11.11, 1);
    expect(result.ok).toBe(false);
  });

  it("stays ok:true when stated area is within 2%", () => {
    const result = checkAreaMismatch({
      ewLength: 30,
      nsLength: 30,
      unit: "ft",
      statedArea: 915,
      statedAreaUnit: "sqft",
    });
    expect(result.ok).toBe(true);
  });

  it("converts stated area in sqm before comparing", () => {
    const result = checkAreaMismatch({
      ewLength: 30,
      nsLength: 30,
      unit: "ft",
      statedArea: 900 / 10.76391042,
      statedAreaUnit: "sqm",
    });
    expect(result.diffPercent).toBeCloseTo(0, 6);
    expect(result.ok).toBe(true);
  });
});
