import { describe, expect, it } from "vitest";
import { buildSetupSuggestion, soldUnitsOf, templateLeftovers } from "./colony-setup.js";

const Z = "‍";
const line = (rest: string) => `विक्रय विलेख\n\nप्रकोष्${Z}ठ/SHOP स्थित - WOODS BUSINESS COURTYARD\nप्रकोष्${Z}ठ/SHOP क्रमांक - ${rest}\nफ्${Z}लोर - Third\nएरिया - 168.8 वर्गफुट यानि 15.68 वर्गमीटर है।`;
const keys = (rest: string) => soldUnitsOf(line(rest)).map((u) => u.unitNo);

describe("Woods unit numbers (the real lines)", () => {
  it("1. several units per deed; a bare number inherits the previous prefix; a bracketed area is that unit's own", () => {
    expect(soldUnitsOf(line("TF - 16 (108.66 वर्गफुट) व TF - 17 (118.42 वर्गफुट)"))).toEqual([
      { unitNo: "TF-16", written: "TF - 16", areaSqft: 108.66, floor: "Third" },
      { unitNo: "TF-17", written: "TF - 17", areaSqft: 118.42, floor: "Third" },
    ]);
    expect(keys("TF - 16 एवं 17")).toEqual(["TF-16", "TF-17"]);
    expect(keys("FF - 04 एवं FF-05")).toEqual(["FF-4", "FF-5"]);
    expect(keys("FF - 004 व 005")).toEqual(["FF-4", "FF-5"]);
    expect(keys("FF - 006 व 007")).toEqual(["FF-6", "FF-7"]);
    expect(keys("FF - 06 एवं FF-07")).toEqual(["FF-6", "FF-7"]);
  });

  it("2. zero padding compares equal (FF-04 = FF-004, TF-5 = TF-05), shown as written", () => {
    expect(keys("FF-04")).toEqual(keys("FF - 004"));
    expect(keys("TF - 5")).toEqual(keys("TF - 05"));
    expect(keys("TF - 7")).toEqual(["TF-7"]);
    expect(soldUnitsOf(line("FF - 004"))[0]!.written).toBe("FF - 004");
  });

  it("3. a letter suffix is kept; no prefix is invented; floor from the hundreds digit", () => {
    expect(keys("SF - 01 (A)")).toEqual(["SF-1A"]);
    expect(keys("SF - 001")).toEqual(["SF-1"]);
    expect(keys("428A")).toEqual(["428A"]);
    expect(keys("428 A")).toEqual(["428A"]);
    expect(soldUnitsOf(line("228 (A)"))).toEqual([{ unitNo: "228A", written: "228 (A)", areaSqft: null, floor: "Second" }]);
    expect(soldUnitsOf(line("401"))[0]).toMatchObject({ unitNo: "401", floor: "Fourth" });
  });

  it("4. the prefix is never lost; anything else is 'could not read — fill by hand'", () => {
    expect(keys("TF - 24")).toEqual(["TF-24"]);
    expect(keys("TF - 18")).toEqual(["TF-18"]);
    expect(keys("12")).toEqual([null]);
    expect(keys("1")).toEqual([null]);
    expect(soldUnitsOf("विक्रय विलेख", "शॉप SHOP क्रमांक - TF - 21 WOODS BUSINESS COURTYARD")[0]!.unitNo).toBe("TF-21");
  });

  it("merged: repeats only the same unit, unreadable ones listed by hand and not imported", () => {
    const d = (id: string, rest: string) => ({ id, title: id, content: line(rest) });
    const s = buildSetupSuggestion(
      [d("a", "TF - 16 (108.66 वर्गफुट) व TF - 17 (118.42 वर्गफुट)"), d("b", "TF - 16 एवं 17"), d("c", "FF - 04 एवं FF-05"), d("e", "FF - 004 व 005"), d("f", "SF - 01 (A)"), d("g", "SF - 001"), d("h", "12")],
      ["WOODS BUSINESS COURTYARD"],
      "SHOP",
    );
    expect(s.plots.map((p) => p.plotNo)).toEqual(["TF-16", "TF-17", "FF-4", "FF-5", "SF-1A", "SF-1"]);
    expect(s.plots.find((p) => p.plotNo === "TF-16")!.areaSqft).toBe(108.66);
    expect(s.plots.find((p) => p.plotNo === "FF-4")!.written).toBe("FF - 04"); // shown as written
    expect(s.unplaced).toEqual([{ plotNo: "12", from: { deedId: "h", title: "h" }, reason: "यूनिट नंबर पढ़ा नहीं जा सका" }]);
    const w = s.warnings.join("\n");
    expect(w).toContain("यूनिट TF-16: 2 डीड");
    expect(w).toContain("यूनिट FF-4: 2 डीड");
    expect(w).not.toContain("SF-1A: 2");
  });

  it("leftover check: a 'कुल क्षेत्रफल … वर्गफुट' line after {{PLOT}}", () => {
    expect(templateLeftovers("{{PLOT}}\nकुल क्षेत्रफल 227.08 वर्गफुट यानि 21.09 वर्गमीटर है।")).toEqual(['क्षेत्रफल की पंक्ति (जैसे "कुल क्षेत्रफल 227.08 वर्गफुट …")']);
    expect(templateLeftovers("{{PLOT}}\nयह कि कॉलोनी 12000 वर्गमीटर भूमि पर है।")).toEqual([]);
  });
});
