import { describe, expect, it } from "vitest";
import {
  DEED_TEXT_PRINTS_MOTHER_NAME,
  missingSampadaFields,
  SAMPADA_REQUIRED_PARTY_FIELDS,
  formatAadhaar,
  formatParty,
  formatPartyBlock,
  formatPropertyBlock,
  parseRelation,
  plotAreaShort,
  plotAreaText,
  splitNameRelation,
  stripHonorific,
} from "./deed-format.js";

describe("office party text (docs/nsk-deed-drafting-pattern.md)", () => {
  it("splits a name typed with the relation", () => {
    expect(splitNameRelation("श्री अमित शर्मा पुत्र श्री राजेश कुमार शर्मा")).toEqual({
      name: "अमित शर्मा",
      relation: "पुत्र",
      guardian: "राजेश कुमार शर्मा",
    });
    expect(splitNameRelation("सुनीता देवी पत्नी स्व. श्री रमेश")).toEqual({ name: "सुनीता देवी", relation: "पत्नी", guardian: "रमेश" });
    expect(splitNameRelation("Priya D/o Mohan Lal")).toEqual({ name: "Priya", relation: "पुत्री", guardian: "Mohan Lal" });
    expect(splitNameRelation("अमित शर्मा")).toBeNull();
  });

  it("strips honorifics and reads the relation menu", () => {
    expect(stripHonorific("श्रीमती सीता देवी")).toBe("सीता देवी");
    expect(stripHonorific("स्व. श्री रमेश")).toBe("रमेश");
    expect(parseRelation("1")).toBe("पुत्र");
    expect(parseRelation("३")).toBe("पत्नी");
    expect(parseRelation("बेटी")).toBe("पुत्री");
    expect(parseRelation("हाँ")).toBeNull();
  });

  it("formats a party exactly like the office", () => {
    expect(formatParty({ name: "अमित शर्मा", relation: "पुत्र", guardian: "राजेश कुमार शर्मा", aadhaar: "234567890124" })).toBe(
      "श्री अमित शर्मा पुत्र श्री राजेश कुमार शर्मा (आधार नं. 2345 6789 0124)",
    );
    expect(formatParty({ name: "सीता देवी", relation: "पत्नी", guardian: "राम प्रसाद", aadhaar: "XXXX0124", pan: "ABCDE1234F" })).toBe(
      "श्रीमती सीता देवी पत्नी श्री राम प्रसाद (आधार नं. XXXX XXXX 0124) (पेन नं. ABCDE1234F)",
    );
    expect(formatParty({ name: "रमेश", relation: null, guardian: null })).toBe("श्री रमेश पुत्र श्री ____ (आधार नं. ____ ____ ____)");
    expect(formatAadhaar(null)).toBe("____ ____ ____");
  });

  it("SAMPADA-required fields: all seven, for every party; mother printed only when the deed type uses it", () => {
    expect([...SAMPADA_REQUIRED_PARTY_FIELDS]).toEqual(["name", "guardian", "motherName", "aadhaar", "mobile", "email", "address"]);
    expect(missingSampadaFields({ name: "अ", guardian: "ब", motherName: "", aadhaar: "1", mobile: "9", email: "  ", address: "x" })).toEqual([
      "motherName",
      "email",
    ]);
    expect(Object.values(DEED_TEXT_PRINTS_MOTHER_NAME).some(Boolean)).toBe(false); // no deed type in the pattern prints it
    const p = { name: "अमित", relation: "पुत्र" as const, guardian: "राजेश", motherName: "सीता", aadhaar: "234567890124" };
    expect(formatParty(p)).not.toContain("सीता"); // collected, not printed by default
    expect(formatParty(p)).not.toContain("@"); // email is never part of the deed text
    expect(formatParty(p, { withMother: true })).toBe("श्री अमित पुत्र श्री राजेश माता श्रीमती सीता (आधार नं. 2345 6789 0124)");
  });

  it("builds party blocks with the office headings", () => {
    expect(formatPartyBlock("विक्रेता पक्ष", ["श्री अ पुत्र श्री ब"])).toBe("विक्रेता पक्ष - श्री अ पुत्र श्री ब");
    expect(formatPartyBlock("क्रेता पक्ष", ["श्री अ", "श्रीमती ब"])).toBe("क्रेता पक्ष -\n1. श्री अ\n2. श्रीमती ब");
  });
});

describe("plot area in both units", () => {
  it("sqft ↔ sqm", () => {
    expect(plotAreaShort(1500, "वर्ग फुट")).toBe("1500 वर्गफुट यानी 139.35 वर्गमीटर");
    expect(plotAreaShort(150, "वर्ग मीटर")).toBe("1614.59 वर्गफुट यानी 150 वर्गमीटर");
    expect(plotAreaText(1500, "sq.ft")).toBe("क्षेत्रफल - ____ फुट x ____ फुट होकर 1500 वर्गफुट यानी 139.35 वर्गमीटर है");
    expect(plotAreaShort(0.5, "हेक्टेयर")).toBeNull();
  });

  it("property block never invents boundaries", () => {
    const plot = formatPropertyBlock({ propertyType: "residential_plot", khasraOrPlotNo: "45", village: null, locality: "सिटी सेंटर", tehsil: null, district: "ग्वालियर", areaValue: 1500, areaUnit: "वर्ग फुट" });
    expect(plot).toContain("प्लाट क्रमांक - 45, सिटी सेंटर, ग्वालियर");
    expect(plot).toContain("1500 वर्गफुट यानी 139.35 वर्गमीटर है");
    expect(plot).toContain("पूर्व - ____");
    const agri = formatPropertyBlock({ propertyType: "agricultural", khasraOrPlotNo: "101", village: "सालूपुरा", locality: null, tehsil: "ग्वालियर", district: "ग्वालियर", areaValue: 0.5, areaUnit: "हेक्टेयर" });
    expect(agri.split("\n").slice(0, 3)).toEqual([
      "विक्रीत की गयी कृषि भूमि का विवरण निम्नानुसार है -",
      "सर्वे क्रमांक - 101 ग्राम सालूपुरा, ग्वालियर, ग्वालियर",
      "क्षेत्रफल - 0.5 हेक्टेयर",
    ]);
  });
});
