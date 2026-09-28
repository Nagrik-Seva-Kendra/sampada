import { describe, expect, it } from "vitest";
import {
  parseAmount,
  taxFlags,
  taxNotice,
  validAadhaar,
  validEmail,
  validMobile,
  validPan,
  verhoeffValid,
} from "./intake-rules.js";

// Build a Verhoeff-valid 12-digit number for tests (no real Aadhaar used).
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
];
const P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];
function withCheck(base11: string): string {
  let c = 0;
  base11.split("").reverse().map(Number).forEach((d, i) => { c = D[c]![P[(i + 1) % 8]![d]!]!; });
  return base11 + INV[c];
}

describe("validators", () => {
  const good = withCheck("23456789012");
  it("accepts a checksum-valid Aadhaar, incl. spaces and Hindi digits", () => {
    expect(verhoeffValid(good)).toBe(true);
    expect(validAadhaar(good.replace(/(\d{4})/g, "$1 "))).toBe(good);
    const hindi = good.replace(/\d/g, (d) => "०१२३४५६७८९"[Number(d)]!);
    expect(validAadhaar(hindi)).toBe(good);
  });
  it("rejects a mistyped Aadhaar", () => {
    const bad = good.slice(0, 11) + String((Number(good[11]!) + 1) % 10);
    expect(validAadhaar(bad)).toBeNull();
    expect(validAadhaar("123456789012")).toBeNull();
  });
  it("PAN / mobile / email", () => {
    expect(validPan("abcde1234f")).toBe("ABCDE1234F");
    expect(validPan("ABCD1234F")).toBeNull();
    expect(validMobile("+91 98765 43210")).toBe("9876543210");
    expect(validMobile("12345")).toBeNull();
    expect(validEmail("A@B.com")).toBe("a@b.com");
    expect(validEmail("nahi")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("parses plain, comma, lakh, crore and Hindi digits", () => {
    expect(parseAmount("1500000")).toBe(1_500_000);
    expect(parseAmount("15,00,000")).toBe(1_500_000);
    expect(parseAmount("15 लाख")).toBe(1_500_000);
    expect(parseAmount("1.25 करोड़")).toBe(12_500_000);
    expect(parseAmount("२५ लाख")).toBe(2_500_000);
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("tax notices", () => {
  it("selects the right rules by value", () => {
    expect(taxFlags(1_500_000, false)).toEqual({ panRequired: false, sftReported: false, tdsApplies: false });
    expect(taxFlags(2_500_000, false).panRequired).toBe(true);
    expect(taxFlags(4_500_000, false).sftReported).toBe(true);
    expect(taxFlags(6_000_000, false).tdsApplies).toBe(true);
    expect(taxFlags(6_000_000, true).tdsApplies).toBe(false);
  });
  it("always carries the disclaimer", () => {
    expect(taxNotice(taxFlags(1_000_000, false))).toContain("स्वयं की ज़िम्मेदारी");
  });
});
