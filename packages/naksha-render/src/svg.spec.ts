import { describe, it, expect } from "vitest";
import { buildNakshaSvg } from "./svg.js";

const parties = { sellerName: "श्री संजय पाण्डेय पुत्र स्व.श्री किशोरी शरण पाण्डेय", buyerName: "श्रीमती सरिता देवी पत्नी श्री आनंद कुमार" };
const boundaries = {
  north: "प्लाट क्रमांक – 172",
  south: "प्लाट क्रमांक – 174",
  east: "प्लाट क्रमांक – 163",
  west: "25 फुट कॉलोनी रोड",
};

const referencePlot = {
  plotNo: "173",
  block: "ई",
  location: "सरस्वती विहार कॉलोनी, ग्राम धनेली, प.ह.नं. 114, जिला ग्वालियर म.प्र.",
  ewLength: 50,
  nsLength: 20,
  unit: "ft" as const,
  boundaries,
};

const wideRectangle = {
  plotNo: "8",
  location: "Morar, Gwalior",
  ewLength: 25,
  nsLength: 80,
  unit: "ft" as const,
  boundaries,
};

const tallRectangle = {
  plotNo: "3",
  location: "Lashkar, Gwalior",
  ewLength: 70,
  nsLength: 20,
  unit: "ft" as const,
  boundaries,
};

const decimalMeasurements = {
  plotNo: "19-B",
  block: "B",
  location: "Thatipur, Gwalior",
  ewLength: 47.25,
  nsLength: 33.5,
  unit: "ft" as const,
  boundaries,
};

const meterUnit = {
  plotNo: "56",
  location: "Hazira, Gwalior",
  ewLength: 18.5,
  nsLength: 12.2,
  unit: "m" as const,
  boundaries,
};

describe("buildNakshaSvg", () => {
  it("produces a well-formed SVG root element", () => {
    const svg = buildNakshaSvg(referencePlot, parties, "hi");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("uses an A4-proportioned canvas width", () => {
    const svg = buildNakshaSvg(referencePlot, parties, "hi");
    expect(svg).toContain('width="794"');
  });

  it("includes the header sentence with the full location text", () => {
    const svg = buildNakshaSvg(referencePlot, {}, "hi");
    expect(svg).toContain("सरस्वती विहार कॉलोनी");
    expect(svg).toContain("धनेली");
    expect(svg).toContain("114");
    expect(svg).toContain("ग्वालियर");
  });

  it("keeps a long real-world address on one header line, not wrapped mid-address", () => {
    const longAddressPlot = {
      ...referencePlot,
      location: "बेलदारपुरा, कोटा लश्‍कर, वार्ड क्रमांक 38, जिला ग्‍वालियर, म.प्र.",
    };
    const svg = buildNakshaSvg(longAddressPlot, {}, "hi");
    const fullLine = "नक्शा सम्पत्ति प्लाट स्थित बेलदारपुरा, कोटा लश्‍कर, वार्ड क्रमांक 38, जिला ग्‍वालियर, म.प्र. में स्थित है।";
    expect(svg).toContain(`>${fullLine}</text>`);
  });

  it("includes seller and buyer names when provided, and omits them when not", () => {
    const withParties = buildNakshaSvg(referencePlot, parties, "hi");
    expect(withParties).toContain(parties.sellerName);
    expect(withParties).toContain(parties.buyerName);

    const withoutParties = buildNakshaSvg(referencePlot, {}, "hi");
    expect(withoutParties).not.toContain("विक्रेता पक्ष");
    expect(withoutParties).not.toContain("क्रेता पक्ष");
  });

  it("includes plot number and block", () => {
    const svg = buildNakshaSvg(referencePlot, parties, "hi");
    expect(svg).toContain("173");
    expect(svg).toContain("ई");
  });

  it("omits the block line when not given", () => {
    const svg = buildNakshaSvg(wideRectangle, parties, "hi");
    expect(svg).not.toContain("ब्लॉक");
  });

  it("omits the plot-number line when not given — not every property has one", () => {
    // referencePlot's own plotNo is "173"; the chauhaddi boundaries legitimately
    // mention neighbors' plot numbers ("172"/"174"/"163"), so check specifically
    // for this plot's own value rather than the whole "प्लाट क्रमांक" phrase.
    const { plotNo: _plotNo, ...withoutPlotNo } = referencePlot;
    const svg = buildNakshaSvg(withoutPlotNo, parties, "hi");
    expect(svg).not.toContain("क्रमांक – 173");
  });

  it("includes all four escaped boundary values", () => {
    const svg = buildNakshaSvg(referencePlot, parties, "hi");
    for (const value of Object.values(boundaries)) {
      expect(svg).toContain(value);
    }
  });

  it("includes the computed area in both sqft and sqm", () => {
    const svg = buildNakshaSvg(referencePlot, parties, "hi");
    expect(svg).toContain("1000"); // 50ft * 20ft
    expect(svg).toContain("92.90"); // 1000 / 10.76391042
  });

  it("includes signature footer labels", () => {
    const svg = buildNakshaSvg(referencePlot, parties, "hi");
    expect(svg).toContain("हस्ता.विक्रेता");
    expect(svg).toContain("हस्ता.क्रेता");
  });

  it("is pure — same input produces byte-identical output", () => {
    const a = buildNakshaSvg(wideRectangle, parties, "hi");
    const b = buildNakshaSvg(wideRectangle, parties, "hi");
    expect(a).toBe(b);
  });

  it("XML-escapes special characters in boundary, location, and party-name text", () => {
    const dangerous = {
      ...referencePlot,
      location: `Gwalior <"tricky"> & co`,
      boundaries: { ...boundaries, north: "12 & 13 <disputed>" },
    };
    const svg = buildNakshaSvg(dangerous, { sellerName: `A & B <Co>` }, "en");
    expect(svg).not.toContain(`<"tricky">`);
    expect(svg).not.toContain("12 & 13 <disputed>");
    expect(svg).not.toContain("A & B <Co>");
    expect(svg).toContain("Gwalior &lt;&quot;tricky&quot;&gt; &amp; co");
    expect(svg).toContain("12 &amp; 13 &lt;disputed&gt;");
    expect(svg).toContain("A &amp; B &lt;Co&gt;");
  });

  describe("5-plot snapshot set", () => {
    it("reference plot (matches the office's real naksha format)", () => {
      expect(buildNakshaSvg(referencePlot, parties, "hi")).toMatchSnapshot();
    });

    it("wide rectangle", () => {
      expect(buildNakshaSvg(wideRectangle, parties, "hi")).toMatchSnapshot();
    });

    it("tall rectangle", () => {
      expect(buildNakshaSvg(tallRectangle, parties, "hi")).toMatchSnapshot();
    });

    it("decimal measurements", () => {
      expect(buildNakshaSvg(decimalMeasurements, parties, "hi")).toMatchSnapshot();
    });

    it("meter unit", () => {
      expect(buildNakshaSvg(meterUnit, parties, "en")).toMatchSnapshot();
    });
  });
});
