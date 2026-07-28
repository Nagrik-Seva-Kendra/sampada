import { describe, it, expect } from "vitest";
import { buildExtractionUserPrompt, ExtractionParseError, parseExtractionResponse } from "./deed-property-extraction.core.js";

const VALID_JSON = JSON.stringify({
  plotNo: "96,97, व 98",
  block: null,
  location: "सरस्वती विहार कॉलोनी, ग्राम धनेली, प.ह.नं. 114, जिला ग्वालियर",
  sellerName: "श्री संजय पाण्डेय पुत्र स्व.श्री किशोरी शरण पाण्डेय",
  buyerName: "श्रीमती सरिता देवी पत्नी श्री आनंद कुमार",
  statedArea: 2955,
  statedAreaUnit: "sqft",
  ewLength: 60,
  nsLength: 49.25,
  unit: "ft",
  boundaries: { north: "Plot 172", south: "Plot 174", east: "Plot 163", west: "25 ft road" },
});

describe("parseExtractionResponse", () => {
  it("parses a well-formed response", () => {
    const result = parseExtractionResponse(VALID_JSON);
    expect(result.plotNo).toBe("96,97, व 98");
    expect(result.location).toContain("धनेली");
    expect(result.sellerName).toContain("संजय");
    expect(result.buyerName).toContain("सरिता");
    expect(result.ewLength).toBe(60);
    expect(result.boundaries.north).toBe("Plot 172");
  });

  it("strips a ```json code fence the model wasn't supposed to add", () => {
    const fenced = "```json\n" + VALID_JSON + "\n```";
    const result = parseExtractionResponse(fenced);
    expect(result.location).toContain("धनेली");
  });

  it("strips a plain ``` fence with no language tag", () => {
    const fenced = "```\n" + VALID_JSON + "\n```";
    const result = parseExtractionResponse(fenced);
    expect(result.sellerName).toContain("संजय");
  });

  it("accepts an all-null response (nothing found)", () => {
    const allNull = JSON.stringify({
      plotNo: null,
      block: null,
      location: null,
      sellerName: null,
      buyerName: null,
      statedArea: null,
      statedAreaUnit: null,
      ewLength: null,
      nsLength: null,
      unit: null,
      boundaries: { north: null, south: null, east: null, west: null },
    });
    const result = parseExtractionResponse(allNull);
    expect(result.plotNo).toBeNull();
    expect(result.sellerName).toBeNull();
    expect(result.boundaries.north).toBeNull();
  });

  it("throws ExtractionParseError on invalid JSON", () => {
    expect(() => parseExtractionResponse("this is not json")).toThrow(ExtractionParseError);
  });

  it("throws ExtractionParseError when the shape doesn't match the schema", () => {
    expect(() => parseExtractionResponse(JSON.stringify({ foo: "bar" }))).toThrow(ExtractionParseError);
  });

  it("throws ExtractionParseError when a field has the wrong type", () => {
    const bad = JSON.stringify({ ...JSON.parse(VALID_JSON), ewLength: "sixty" });
    expect(() => parseExtractionResponse(bad)).toThrow(ExtractionParseError);
  });

  it("throws ExtractionParseError when statedAreaUnit isn't one of the allowed enum values", () => {
    const bad = JSON.stringify({ ...JSON.parse(VALID_JSON), statedAreaUnit: "acres" });
    expect(() => parseExtractionResponse(bad)).toThrow(ExtractionParseError);
  });
});

describe("buildExtractionUserPrompt", () => {
  it("wraps the deed content in a labeled block", () => {
    const prompt = buildExtractionUserPrompt("यह विक्रय पत्र है।");
    expect(prompt).toContain("यह विक्रय पत्र है।");
    expect(prompt).toContain("Deed text:");
  });
});
