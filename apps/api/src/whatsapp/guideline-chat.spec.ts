import { DEFAULT_OFFICE_FEES } from "@sampada/shared";
import { describe, expect, it } from "vitest";
import {
  GUIDE_ASK_AREA,
  GUIDE_ASK_BOUNDARY,
  GUIDE_ASK_CORNER,
  GUIDE_ASK_NAME,
  GUIDE_ASK_TYPE,
  GUIDE_DISCLAIMER,
  type GuideState,
  guideAnswer,
  guideFacts,
  guideNext,
  guideReply,
  guideRows,
  localityOf,
  mergeFacts,
} from "./guideline-chat.js";
import { GUIDELINE_DATA, plotAreaToSqm, plotValue, stampDuty } from "./guideline/calculator.js";

const TEXT = "33,47,000/- pe hogi\nGanga vihar ward 60 ki rate k hisaab se 2770 sqft ka bata do guideline";
const fees = DEFAULT_OFFICE_FEES;
const start = (text: string, amount: number | null): GuideState => mergeFacts({ mode: "guide", step: "NAME", amount }, guideFacts(text));
const SNO_845 = GUIDELINE_DATA.find((e) => e.sno === 845)!;

describe("guideline from the customer's words", () => {
  it("reads locality, ward, area; nothing it was not told", () => {
    expect(guideFacts(TEXT)).toEqual({ name: "Ganga vihar", ward: "60", type: null, area: { value: 2770, unit: "sqft" }, corner: null, boundary: null });
    expect(guideFacts("गंगा विहार वार्ड नं. 60 में 257 वर्गमीटर का कॉर्नर प्लॉट")).toEqual({
      name: "गंगा विहार",
      ward: "60",
      type: "plotRes",
      area: { value: 257, unit: "sqm" },
      corner: true,
      boundary: null,
    });
    expect(guideFacts("30x40 ka plot, corner nahi").area).toEqual({ value: 1200, unit: "sqft" });
    expect(guideFacts("30x40 ka plot, corner nahi").corner).toBe(false);
    expect(guideFacts("40 फुट रोड पर मकान").area).toBeNull(); // road width, not an area
    expect(guideFacts("40 फुट रोड पर मकान").type).toBe("house");
    expect(localityOf("guideline bata do Ganga vihar")).toBe("Ganga vihar");
    expect(localityOf("2770 sqft ka guideline")).toBeNull();
  });

  it("rows come from the guideline table: ward 60 → only 'श्री गंगा विहार इन्क्लेव'; no ward → every Ganga Vihar row, none picked", () => {
    expect(guideRows("Ganga vihar", "60").map((e) => e.sno)).toEqual([845]);
    const all = guideRows("Ganga vihar", null).map((e) => e.sno);
    expect(all).toEqual(expect.arrayContaining([216, 295, 399, 845]));
    expect(guideRows("Ganga vihar", "61")).toEqual([]);
  });
});

describe("the 7:09 PM example: ₹33,47,000, Ganga Vihar ward 60, 2770 sqft", () => {
  it("asks only what is missing: row (confirm), type, corner; then the calculator's numbers", () => {
    let t = guideNext(start(TEXT, 3_347_000), fees);
    expect(t.state).toMatchObject({ step: "PICK", options: [845], ward: "60", area: { value: 2770, unit: "sqft" } });
    expect(t.replies[0]).toContain("यह पंक्ति मिली — सही है तो 1 लिखें");
    expect(t.replies[0]).toContain("0. इनमें से कोई नहीं");
    t = guideReply(t.state!, "1", fees);
    expect(t.replies).toEqual([GUIDE_ASK_TYPE]);
    t = guideReply(t.state!, "1", fees);
    expect(t.replies).toEqual([GUIDE_ASK_CORNER]);
    t = guideReply(t.state!, "nahi", fees);
    expect(t.replies).toEqual([GUIDE_ASK_BOUNDARY]);
    t = guideReply(t.state!, "2", fees);
    expect(t.state).toBeNull();
    expect(t.outcome).toBe("answered");
    const text = t.replies[0]!;

    // The office calculator itself, for the same inputs.
    const sqm = plotAreaToSqm(2770, "sqft");
    const calc = plotValue({ entry: SNO_845, areaSqm: sqm, use: "res", corner: false });
    const sd = stampDuty(calc.value, SNO_845, 3_347_000);
    expect(Math.round(calc.value)).toBe(3_345_437);
    expect(sd.male.stampDuty).toBe(317_897);
    expect(sd.male.registration).toBe(100_363);

    expect(text).toContain("पंक्ति: क्र. 845 — सिंधिया नगर श्री गंगा विहार इन्क्लेव (वार्ड 60)");
    expect(text).toContain("दर: ₹13,000 प्रति वर्गमीटर (आवासीय भूखण्ड)");
    expect(text).toContain("क्षेत्रफल: 2770 वर्गफुट = 257.34 वर्गमीटर");
    expect(text).toContain("गाइडलाइन मूल्य: ₹33,45,437");
    expect(text).toContain("रजिस्ट्री राशि: ₹33,47,000 (गाइडलाइन से ₹1,563 ज़्यादा)");
    expect(text).toContain("स्टाम्प शुल्क: ₹3,17,897 (नगर निगम क्षेत्र — गाइडलाइन पर 9.5% + ऊपर की राशि ₹1,563 पर 5.1% = ₹80)");
    expect(text).toContain("पंजीयन शुल्क: पुरुष / संयुक्त क्रेता 3% = ₹1,00,363, केवल महिला क्रेता 1% = ₹33,454");
    expect(text).toContain("कार्यालय शुल्क: ₹5,500 (लेखन शुल्क सहित, ₹33,47,000 पर — जो ज़्यादा हो)");
    expect(text).toContain(GUIDE_DISCLAIMER);
  });

  it("without an amount: only the guideline; corner +10% by the calculator", () => {
    const a = guideAnswer({ entry: SNO_845, type: "plotRes", area: { value: 2770, unit: "sqft" }, corner: true, boundary: false, amount: null }, fees);
    const calc = plotValue({ entry: SNO_845, areaSqm: plotAreaToSqm(2770, "sqft"), use: "res", corner: true });
    expect(a.value).toBe(Math.round(calc.value));
    expect(a.text).toContain("+ कॉर्नर 10%");
    expect(a.text).not.toContain("रजिस्ट्री राशि");
    expect(a.text).not.toContain("ऊपर की राशि");
    expect(a.stamp.male.stampDuty).toBe(Math.round(calc.value * 0.095));
  });
});

describe("corner and boundary wall / नींव: +10% each, +20% together (calculator plotValue)", () => {
  const value = (corner: boolean, foundation: boolean) =>
    Math.round(plotValue({ entry: SNO_845, areaSqm: plotAreaToSqm(2770, "sqft"), use: "res", corner, foundation }).value);
  const answer = (corner: boolean, boundary: boolean) =>
    guideAnswer({ entry: SNO_845, type: "plotRes", area: { value: 2770, unit: "sqft" }, corner, boundary, amount: null }, fees);

  it("matches the calculator for every combination", () => {
    expect(value(true, true)).toBe(Math.round(13_000 * 1.2 * plotAreaToSqm(2770, "sqft")));
    expect(answer(true, true).value).toBe(value(true, true));
    expect(answer(true, false).value).toBe(value(true, false));
    expect(answer(false, true).value).toBe(value(false, true));
    expect(answer(false, false).value).toBe(3_345_437);
    expect(answer(true, true).text).toContain("दर: ₹13,000 प्रति वर्गमीटर (आवासीय भूखण्ड) + कॉर्नर 10% + बाउंड्री वॉल/नींव 10% = ₹15,600");
    expect(answer(false, true).text).toContain("+ बाउंड्री वॉल/नींव 10% = ₹14,300");
    expect(answer(false, false).text).toContain("मान्यता: सड़क प्रीमियम 0%; कॉर्नर नहीं; बाउंड्री वॉल / नींव नहीं।");
  });

  it("read from the text, else asked", () => {
    expect(guideFacts("corner plot, boundary wall bani hai").boundary).toBe(true);
    expect(guideFacts("बाउंड्री वॉल नहीं है").boundary).toBe(false);
    expect(guideFacts("नींव भरी है").boundary).toBe(true);
    expect(guideFacts("कॉर्नर नहीं है").corner).toBe(false);
    expect(guideFacts("bina boundary ka plot").boundary).toBe(false);
    const t = guideNext(mergeFacts({ mode: "guide", step: "NAME", amount: null, sno: 845 }, guideFacts("2770 sqft corner plot boundary wall bani hai")), fees);
    expect(t.outcome).toBe("answered");
    expect(t.replies[0]).toContain("= ₹15,600");
    const ask = guideNext(mergeFacts({ mode: "guide", step: "NAME", amount: null, sno: 845 }, guideFacts("2770 sqft corner plot")), fees);
    expect(ask.replies).toEqual([GUIDE_ASK_BOUNDARY]);
    expect(guideReply(ask.state!, "haan", fees).replies[0]).toContain("= ₹15,600");
  });
});

describe("guideline questions: never a guess, never silent", () => {
  it("no locality → asked; area missing → asked; unclear answers repeat the question", () => {
    let t = guideNext(start("guideline batao", null), fees);
    expect(t.replies).toEqual([GUIDE_ASK_NAME]);
    t = guideReply(t.state!, "Ganga vihar ward 60", fees);
    expect(t.state!.step).toBe("PICK");
    t = guideReply(t.state!, "kya", fees);
    expect(t.state!.step).toBe("PICK");
    expect(t.replies[0]).toContain("कृपया सूची में से नंबर लिखें");
    t = guideReply(t.state!, "1", fees);
    t = guideReply(t.state!, "plot", fees);
    expect(t.replies).toEqual([GUIDE_ASK_AREA]);
    t = guideReply(t.state!, "2770", fees);
    expect(t.replies[0]).toContain("इकाई भी लिखें");
    t = guideReply(t.state!, "2770 sqft, corner, boundary wall nahi", fees);
    expect(t.outcome).toBe("answered");
    expect(t.replies[0]).toContain("+ कॉर्नर 10%");
  });

  it("several rows → listed to choose; 'none' → PDF; house / shop / farm → not guessed", () => {
    let t = guideNext(start("Ganga vihar ka plot guideline", null), fees);
    expect(t.state!.step).toBe("PICK");
    expect(t.state!.options!.length).toBeGreaterThan(1);
    const none = guideReply(t.state!, "0", fees);
    expect(none).toMatchObject({ state: null, outcome: "not-found" });
    expect(none.replies[0]).toContain("PDF");
    for (const w of ["makan", "दुकान", "flat", "खेती"]) {
      t = guideNext(start(`Ganga vihar ward 60 ${w} 2770 sqft guideline`, null), fees);
      expect(t.outcome).toBe("unsupported-type");
      expect(t.replies[0]).toContain("अनुमान नहीं लगाता");
    }
  });
});
