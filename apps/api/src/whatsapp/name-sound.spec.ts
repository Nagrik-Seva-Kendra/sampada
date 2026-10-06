import { describe, expect, it } from "vitest";
import { guideRows } from "./guideline-chat.js";
import { soundKey, soundsIn } from "./name-sound.js";

describe("place names by sound (Hindi or English, any spelling)", () => {
  it.each([
    ["Scindia", "SHINDIYA"],
    ["Scindia", "सिंधिया"],
    ["Thatipur", "थाटीपुर"],
    ["City", "सिटी"],
    ["Center", "सेंटर"],
    ["Centre", "CENTER"],
    ["Gwalior", "ग्वालियर"],
    ["Lashkar", "लश्कर"],
    ["Morar", "मुरार"],
  ])("%s ≈ %s", (a, b) => expect(soundKey(a)).toBe(soundKey(b)));

  it("every word must be there; joined words match words written apart", () => {
    expect(soundsIn("gangavihar", "गंगा विहार GANGA VIHAR")).toBe(true);
    expect(soundsIn("Ganga vihar", "SHINDIYA NAGAR SHRI GANGA VIHAR ENCLAVE")).toBe(true);
    expect(soundsIn("Ganga vihar", "GAYATRI VIHAR")).toBe(false);
    expect(soundsIn("ab", "AB ROAD")).toBe(false); // too short to compare
  });

  it("the guideline rows: the same row from Hindi or English, any spelling", () => {
    const sno = (name: string, ward: string | null) => guideRows(name, ward).map((e) => e.sno);
    expect(sno("Ganga vihar", "60")).toEqual([845]);
    expect(sno("गंगा विहार", "60")).toEqual([845]);
    expect(sno("gangavihar", "60")).toEqual([845]);
    expect(sno("Scindia nagar", "60")).toEqual([845]);
    expect(sno("सिंधिया नगर", "60")).toEqual([845]);
    expect(sno("सिटी सेंटर", null)).toEqual(sno("City Center", null));
    expect(sno("थाटीपुर", null)).toEqual(sno("Thatipur", null));
    expect(sno("Ganga vihar", "61")).toEqual([]);
  });
});
