import { describe, it, expect } from "vitest";
import { buildBoundaryText } from "./boundary-text.js";

const boundaries = { north: "Plot 12", south: "Road", east: "Plot 14", west: "Plot 10" };

describe("buildBoundaryText", () => {
  it("renders all four boundaries in Hindi, East/West/North/South order", () => {
    const text = buildBoundaryText({ boundaries }, "hi");
    expect(text).toBe(
      ["पूर्व में : Plot 14", "पश्चिम में : Plot 10", "उत्तर में : Plot 12", "दक्षिण में : Road"].join("\n"),
    );
  });

  it("renders all four boundaries in English", () => {
    const text = buildBoundaryText({ boundaries }, "en");
    expect(text).toBe(["East : Plot 14", "West : Plot 10", "North : Plot 12", "South : Road"].join("\n"));
  });

  it("is pure — same input produces identical output", () => {
    const a = buildBoundaryText({ boundaries }, "hi");
    const b = buildBoundaryText({ boundaries }, "hi");
    expect(a).toBe(b);
  });
});
