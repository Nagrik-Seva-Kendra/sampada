import { describe, expect, it } from "vitest";
import { DEFAULT_OFFICE_FEES, officeFeeFor, WaOfficeFees } from "./wa-office-fees.js";

describe("office fees (owner's table)", () => {
  it("registry slabs by the higher value; 50 lakh exactly is the first slab", () => {
    expect(officeFeeFor("registry", 1_500_000)).toBe(5_500);
    expect(officeFeeFor("registry", 5_000_000)).toBe(5_500);
    expect(officeFeeFor("registry", 5_000_001)).toBe(6_500);
    expect(officeFeeFor("registry", 7_500_000)).toBe(6_500);
    expect(officeFeeFor("registry", 7_500_001)).toBeNull(); // कार्यालय बताएगा
    expect(officeFeeFor("registry", null)).toBeNull();
  });
  it("GDA पट्टा and other documents are flat", () => {
    expect(officeFeeFor("gdaPatta", null)).toBe(10_000);
    expect(officeFeeFor("other", 99_000_000)).toBe(6_000);
  });
  it("owner's edited table is used and validated", () => {
    const cfg = { ...DEFAULT_OFFICE_FEES, registrySlabs: [{ upTo: 7_500_000, fee: 7_000 }, { upTo: 5_000_000, fee: 5_000 }], registryAbove: 9_000 };
    expect(officeFeeFor("registry", 4_000_000, cfg)).toBe(5_000);
    expect(officeFeeFor("registry", 9_000_000, cfg)).toBe(9_000);
    expect(WaOfficeFees.safeParse({ ...DEFAULT_OFFICE_FEES, gdaPatta: -1 }).success).toBe(false);
    expect(WaOfficeFees.safeParse(DEFAULT_OFFICE_FEES).success).toBe(true);
  });
});
