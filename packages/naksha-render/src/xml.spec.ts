import { describe, it, expect } from "vitest";
import { escapeXml } from "./xml.js";

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(escapeXml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeXml(`He said "hi" and 'bye'`)).toBe("He said &quot;hi&quot; and &apos;bye&apos;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeXml("Plot 12, Gwalior")).toBe("Plot 12, Gwalior");
  });

  it("leaves Devanagari text untouched", () => {
    expect(escapeXml("भूखंड क्रमांक १२")).toBe("भूखंड क्रमांक १२");
  });
});
