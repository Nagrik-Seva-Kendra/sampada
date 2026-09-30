import { describe, expect, it } from "vitest";
import { GuidelineLookupService, matchEntry, parseLocation, parseUnit } from "./guideline-lookup.service.js";
import type { DeedProperty } from "./deed-extractor.service.js";

const base: DeedProperty = {
  district: "ग्वालियर",
  tehsil: "ग्वालियर ग्रामीण",
  village: "सालूपुरा",
  locality: "वार्ड 66, सालूपुरा (रोड से अन्दर)",
  khasraOrPlotNo: "101, 100",
  propertyType: "agricultural",
  areaValue: 0.5035,
  areaUnit: "हेक्टेयर",
};

describe("location matching (exact only)", () => {
  it("parses ward and names from the deed text", () => {
    const r = parseLocation(base);
    expect(r.ward).toBe("66");
    expect(r.names).toContain("सालूपुरा (रोड से अन्दर)");
  });
  it("matches the exact guideline row (sno 1063)", () => {
    expect(matchEntry(base)?.sno).toBe(1063);
  });
  it("does not match when the ward differs", () => {
    expect(matchEntry({ ...base, locality: "वार्ड 12, सालूपुरा (रोड से अन्दर)" })).toBeNull();
  });
  it("does not guess from a partial name", () => {
    expect(matchEntry({ locality: "सालूपुरा", village: null })).toBeNull();
  });
  it("recognises units and refuses ambiguous bigha", () => {
    expect(parseUnit("हेक्टेयर")).toBe("hect");
    expect(parseUnit("वर्ग फुट")).toBe("sqft");
    expect(parseUnit("वर्ग मीटर")).toBe("sqm");
    expect(parseUnit("बीघा")).toBeNull();
  });
});

describe("GuidelineLookupService", () => {
  const svc = new GuidelineLookupService();

  it("hands agricultural land to staff when irrigation is not stated", async () => {
    expect(await svc.lookup(base)).toBeNull();
  });

  it("values irrigated undiverted land exactly like the office calculator", async () => {
    const r = await svc.lookup({ ...base, irrigation: "irrigated", diverted: false });
    expect(r?.marketValue).toBe(18642800); // golden: office calculator
    expect(r?.stamp.male.total).toBe(2330350);
    expect(r?.zone).toBe("nigam1");
  });

  it("values a residential plot in sqft", async () => {
    const r = await svc.lookup({ ...base, propertyType: "residential_plot", areaValue: 1500, areaUnit: "वर्ग फुट" });
    expect(r?.marketValue).toBe(1741931);
  });

  it("refuses house/flat (needs construction details)", async () => {
    expect(await svc.lookup({ ...base, propertyType: "house" })).toBeNull();
  });

  it("refuses multiple owners outside gramin (khata multiplier needs staff)", async () => {
    expect(await svc.lookup({ ...base, irrigation: "irrigated", diverted: false }, { owners: 2 })).toBeNull();
  });

  it("refuses other districts", async () => {
    expect(await svc.lookup({ ...base, district: "भिंड", irrigation: "irrigated", diverted: false })).toBeNull();
  });
});

describe("plot answers from the customer (corner / house)", () => {
  const svc = new GuidelineLookupService();
  const plot: DeedProperty = { ...base, propertyType: "residential_plot", areaValue: 1500, areaUnit: "वर्ग फुट" };

  it("corner = yes adds the office calculator's +10%", async () => {
    const plain = await svc.lookup(plot, { plot: { hasBuilding: false, corner: false } });
    const corner = await svc.lookup(plot, { plot: { hasBuilding: false, corner: true } });
    expect(plain?.marketValue).toBe(1741931); // same golden value as without answers
    expect(corner!.marketValue).toBeCloseTo(plain!.marketValue * 1.1, -1);
    expect(corner!.lines[0]).toContain("कॉर्नर +10%");
    expect(corner!.assumptions.join(" ")).not.toContain("कॉर्नर प्रीमियम नहीं");
  });

  it("corner unknown → no premium, and says so", async () => {
    const r = await svc.lookup(plot, { plot: { hasBuilding: false, corner: null } });
    expect(r?.marketValue).toBe(1741931);
    expect(r!.assumptions).toContain("कॉर्नर प्रीमियम नहीं जोड़ा गया (कॉर्नर की जानकारी नहीं)");
  });

  it("house built, or not known → staff (null)", async () => {
    expect(await svc.lookup(plot, { plot: { hasBuilding: true, corner: false } })).toBeNull();
    expect(await svc.lookup(plot, { plot: { hasBuilding: null, corner: false } })).toBeNull();
  });
});
