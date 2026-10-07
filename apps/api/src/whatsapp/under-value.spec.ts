import { DEFAULT_OFFICE_FEES } from "@sampada/shared";
import { describe, expect, it } from "vitest";
import { guideNext, guideFacts, guideReply, mergeFacts } from "./guideline-chat.js";
import { fullCostText } from "./satisfaction.js";
import { underValueWarning } from "./under-value.js";
import { registryCostText } from "./wa-smart.js";

const fees = DEFAULT_OFFICE_FEES;

describe("registry far below the guideline value: the owner's warning", () => {
  it("below 90% of the guideline → warned, with both amounts and who answers for it", () => {
    const w = underValueWarning(2_500_000, 83_610_000)!;
    expect(w).toContain("गाइडलाइन मूल्य ₹8,36,10,000");
    expect(w).toContain("रजिस्ट्री ₹25,00,000 पर");
    expect(w).toContain("आयकर विभाग");
    expect(w).toContain("कम मूल्यांकन (below valuation)");
    expect(w).toContain("पूरी ज़िम्मेदारी आपकी होगी");
    expect(w).toContain("नागरिक सेवा केंद्र का इससे कोई लेना-देना नहीं होगा");
  });

  it.each([
    [3_000_000, 3_000_000],
    [2_800_000, 3_000_000], // within 10%
    [5_000_000, 3_000_000],
    [null, 3_000_000],
    [3_000_000, null],
  ])("amount %s, guideline %s → no warning", (a, g) => {
    expect(underValueWarning(a, g)).toBeNull();
  });

  it("in every estimate: the guideline calculator (farm land, plot), the PDF estimate, the full cost", () => {
    let t = guideNext(mergeFacts({ mode: "guide", step: "NAME", amount: 2_500_000 }, guideFacts("Guideline - Alapur Road 0.209 Hectare")), fees);
    for (const a of ["1", "1", "1"]) t = guideReply(t.state!, a, fees);
    expect(t.replies[0]).toContain("⚠️ चेतावनी");
    expect(t.replies[0]).toContain("₹8,36,10,000");

    let p = guideNext(mergeFacts({ mode: "guide", step: "NAME", amount: 100_000 }, guideFacts("Ganga vihar ward 60 plot 2770 sqft corner nahi boundary nahi")), fees);
    p = guideReply(p.state!, "1", fees);
    expect(p.replies[0]).toContain("⚠️ चेतावनी");

    expect(registryCostText({ amount: 1_000_000, guideline: { value: 3_000_000, sdPct: 0.095 } }, fees)).toContain("⚠️ चेतावनी");
    expect(registryCostText({ amount: 3_000_000, guideline: { value: 3_000_000, sdPct: 0.095 } }, fees)).not.toContain("चेतावनी");
    expect(registryCostText({ amount: 1_000_000, guideline: null }, fees)).not.toContain("चेतावनी");
    expect(fullCostText({ amount: 1_000_000, guideline: { marketValue: 3_000_000, stamp: { sdPct: 0.095 } } }, fees, 250)).toContain("⚠️ चेतावनी");
  });
});
