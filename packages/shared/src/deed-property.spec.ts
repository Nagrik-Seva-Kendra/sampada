import { describe, it, expect } from "vitest";
import { DeedPropertyDetailCreateInput, BoundarySchema } from "./deed-property.js";

const validBoundaries = { north: "Plot 12", south: "Road", east: "Plot 14", west: "Plot 10" };

const validInput = {
  plotNo: "12",
  location: "Gwalior",
  ewLength: 40,
  nsLength: 60,
  unit: "ft" as const,
  boundaries: validBoundaries,
};

describe("DeedPropertyDetailCreateInput", () => {
  it("accepts a valid rectangle plot", () => {
    const result = DeedPropertyDetailCreateInput.parse(validInput);
    expect(result.plotNo).toBe("12");
    expect(result.shape).toBe("rectangle");
  });

  it("defaults shape to rectangle when omitted", () => {
    const result = DeedPropertyDetailCreateInput.parse(validInput);
    expect(result.shape).toBe("rectangle");
  });

  it("accepts a plot with no plotNo at all — not every property has one", () => {
    const { plotNo: _plotNo, ...withoutPlotNo } = validInput;
    const result = DeedPropertyDetailCreateInput.parse(withoutPlotNo);
    expect(result.plotNo).toBeUndefined();
  });

  it("accepts optional block, sellerName, buyerName, statedArea and statedAreaUnit", () => {
    const result = DeedPropertyDetailCreateInput.parse({
      ...validInput,
      block: "ई",
      sellerName: "श्री संजय पाण्डेय पुत्र स्व.श्री किशोरी शरण पाण्डेय",
      buyerName: "श्रीमती सरिता देवी पत्नी श्री आनंद कुमार",
      statedArea: 2400,
      statedAreaUnit: "sqft",
    });
    expect(result.block).toBe("ई");
    expect(result.sellerName).toContain("संजय");
    expect(result.buyerName).toContain("सरिता");
    expect(result.statedArea).toBe(2400);
  });

  it("rejects a missing boundary", () => {
    expect(() =>
      DeedPropertyDetailCreateInput.parse({
        ...validInput,
        boundaries: { north: "", south: "Road", east: "Plot 14", west: "Plot 10" },
      }),
    ).toThrow();
  });

  it("rejects a non-positive ewLength", () => {
    expect(() => DeedPropertyDetailCreateInput.parse({ ...validInput, ewLength: 0 })).toThrow();
    expect(() => DeedPropertyDetailCreateInput.parse({ ...validInput, ewLength: -5 })).toThrow();
  });

  it("rejects a non-positive nsLength", () => {
    expect(() => DeedPropertyDetailCreateInput.parse({ ...validInput, nsLength: 0 })).toThrow();
  });

  it("rejects an invalid length unit", () => {
    expect(() => DeedPropertyDetailCreateInput.parse({ ...validInput, unit: "km" })).toThrow();
  });

  it("rejects an invalid area unit", () => {
    expect(() =>
      DeedPropertyDetailCreateInput.parse({ ...validInput, statedArea: 100, statedAreaUnit: "acre" }),
    ).toThrow();
  });

  it("rejects a missing location", () => {
    expect(() => DeedPropertyDetailCreateInput.parse({ ...validInput, location: "" })).toThrow();
  });

  it("trims whitespace from string fields", () => {
    const result = DeedPropertyDetailCreateInput.parse({
      ...validInput,
      plotNo: "  12  ",
      location: "  Gwalior  ",
    });
    expect(result.plotNo).toBe("12");
    expect(result.location).toBe("Gwalior");
  });
});

describe("BoundarySchema", () => {
  it("accepts all four boundaries", () => {
    expect(BoundarySchema.parse(validBoundaries)).toEqual(validBoundaries);
  });

  it("rejects when any single boundary is missing", () => {
    for (const key of ["north", "south", "east", "west"] as const) {
      expect(() => BoundarySchema.parse({ ...validBoundaries, [key]: "" })).toThrow();
    }
  });
});
