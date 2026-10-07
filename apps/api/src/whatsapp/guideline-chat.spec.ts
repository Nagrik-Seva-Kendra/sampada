import { DEFAULT_OFFICE_FEES } from "@sampada/shared";
import { describe, expect, it } from "vitest";
import {
  GUIDE_ASK_AREA,
  GUIDE_ASK_DIVERTED,
  GUIDE_ASK_FLAT_USE,
  GUIDE_ASK_FLOOR,
  GUIDE_ASK_IRRIGATED,
  GUIDE_ASK_LIFT,
  GUIDE_ASK_PARTIES,
  readAge,
  readBuildKind,
  readFloors,
  readParties,
  GUIDE_ASK_AGE,
  GUIDE_ASK_FLOORS,
  GUIDE_ASK_HOUSE_KIND,
  GUIDE_ASK_HOUSE_PLOT,
  GUIDE_ASK_SHOP_KIND,
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
import { agriValue, buildingValue, divertedValue, flatValue, GUIDELINE_DATA, plotAreaToSqm, plotValue, stampDuty } from "./guideline/calculator.js";

const TEXT = "33,47,000/- pe hogi\nGanga vihar ward 60 ki rate k hisaab se 2770 sqft ka bata do guideline";
const fees = DEFAULT_OFFICE_FEES;
const start = (text: string, amount: number | null): GuideState => mergeFacts({ mode: "guide", step: "NAME", amount }, guideFacts(text));
const SNO_845 = GUIDELINE_DATA.find((e) => e.sno === 845)!;

describe("guideline from the customer's words", () => {
  it("reads locality, ward, area; nothing it was not told", () => {
    expect(guideFacts(TEXT)).toEqual({ name: "Ganga vihar", ward: "60", type: null, area: { value: 2770, unit: "sqft" }, corner: null, boundary: null, agriArea: null, diverted: null, irrigated: null, roadPct: null });
    expect(guideFacts("गंगा विहार वार्ड नं. 60 में 257 वर्गमीटर का कॉर्नर प्लॉट")).toEqual({
      name: "गंगा विहार",
      ward: "60",
      type: "plotRes",
      area: { value: 257, unit: "sqm" },
      corner: true,
      boundary: null,
      agriArea: null,
      diverted: null,
      irrigated: null,
      roadPct: null,
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

  it("several rows → listed to choose; 'none' → PDF; house / shop → row listed first", () => {
    let t = guideNext(start("Ganga vihar ka plot guideline", null), fees);
    expect(t.state!.step).toBe("PICK");
    expect(t.state!.options!.length).toBeGreaterThan(1);
    const none = guideReply(t.state!, "0", fees);
    expect(none).toMatchObject({ state: null, outcome: "not-found" });
    expect(none.replies[0]).toContain("PDF");
    // House / shop are worked out now: the row is listed first, nothing guessed.
    for (const w of ["makan", "दुकान"]) {
      t = guideNext(start(`Ganga vihar ward 60 ${w} 2770 sqft guideline`, null), fees);
      expect(t.state!.step).toBe("PICK");
    }
  });
});

describe("agricultural land (the office calculator's agriValue / divertedValue)", () => {
  const ALAPUR = GUIDELINE_DATA.find((e) => e.sno === 820)!;
  const SCREENSHOT = "25 lakh\nGuideline - Alapur Road\n0.209 Hectare ki";

  it("reads hectare / acre / bigha, diversion and irrigation from the words", () => {
    const f = guideFacts(SCREENSHOT);
    expect(f).toMatchObject({ name: "Alapur Road", type: "agri", agriArea: { value: 0.209, unit: "hect" }, area: null });
    expect(guideFacts("1.5 एकड़ खेती की ज़मीन").agriArea).toEqual({ value: 1.5, unit: "acre" });
    expect(guideFacts("2 बीघा पक्का").agriArea).toEqual({ value: 2, unit: "bigha_p" });
    expect(guideFacts("2 bigha kachcha").agriArea).toEqual({ value: 2, unit: "bigha_k" });
    expect(guideFacts("2 बीघा").agriArea).toBeNull();
    expect(guideFacts("diversion ho chuka hai").diverted).toBe("res");
    expect(guideFacts("diversion nahi hua").diverted).toBe("no");
    expect(guideFacts("असिंचित जमीन").irrigated).toBe(false);
    expect(guideFacts("सिंचित जमीन").irrigated).toBe(true);
  });

  it("the 8:47 AM screenshot: rows listed (Alapur main road first) → diversion asked → the calculator's value", () => {
    let t = guideNext(start(SCREENSHOT, 2_500_000), fees);
    expect(t.state!.step).toBe("PICK");
    expect(t.replies[0]).toContain("1. क्र. 820 — अलापुर (मुख्य रोड पर) (वार्ड 60)");
    t = guideReply(t.state!, "1", fees);
    expect(t.replies).toEqual([GUIDE_ASK_DIVERTED]);
    // This row has one rate for irrigated and unirrigated: not asked. 2090 sqm > 1000: sellers / buyers asked.
    t = guideReply(t.state!, "1", fees);
    expect(t.replies).toEqual([GUIDE_ASK_PARTIES]);
    t = guideReply(t.state!, "1", fees);
    expect(t.outcome).toBe("answered");
    const want = agriValue({ entry: ALAPUR, areaSqm: 2090, irrigated: true, zone: "nigam1" });
    const st = stampDuty(want.total, ALAPUR, 2_500_000);
    const a = t.replies[0]!;
    expect(a).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.total).toLocaleString("en-IN")}`);
    expect(a).toContain("गाइडलाइन मूल्य: ₹8,36,10,000");
    expect(a).toContain("• 400 वर्गमीटर × ₹90,000 (भूखण्ड दर) = ₹3,60,00,000");
    expect(a).toContain("• 0.109 हेक्टेयर × ₹9,00,00,000 प्रति हेक्टेयर (कृषि दर) = ₹98,10,000");
    expect(a).toContain(`स्टाम्प शुल्क: ₹${st.male.stampDuty.toLocaleString("en-IN")}`);
    expect(a).toContain("सिंचित / असिंचित की दर एक ही है");
    expect(a).toContain("विक्रेता 1 और क्रेता 1");
  });

  it("diverted land uses divertedValue; a row with two rates asks irrigation; unclear area asks again", () => {
    const g = { mode: "guide" as const, step: "DIVERTED" as const, amount: null, sno: 820, type: "agri" as const, agriArea: { value: 0.209, unit: "hect" as const } };
    const div = guideReply({ ...g, parties: { sellers: 1, buyers: 1 } }, "2", fees);
    const want = divertedValue({ entry: ALAPUR, areaSqm: 2090, use: "res", zone: "nigam1" });
    expect(div.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.total).toLocaleString("en-IN")}`);
    expect(div.replies[0]).toContain("डायवर्टेड ज़मीन (आवासीय)");

    const two = GUIDELINE_DATA.find((e) => e.agri_irr && e.agri_unirr && e.agri_irr !== e.agri_unirr && e.ward === "NON-PLANNING AREA")!;
    const ask = guideReply({ ...g, sno: two.sno, parties: { sellers: 1, buyers: 1 } }, "1", fees);
    expect(ask.replies).toEqual([GUIDE_ASK_IRRIGATED]);
    const ans = guideReply(ask.state!, "2", fees);
    const w2 = agriValue({ entry: two, areaSqm: 2090, irrigated: false, zone: "gramin" });
    expect(ans.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(w2.total).toLocaleString("en-IN")}`);

    const area = guideReply({ ...g, step: "AGRI_AREA", agriArea: null }, "2 बीघा", fees);
    expect(area.replies[0]).toContain("पक्का है या कच्चा");
  });
});

describe("the rest of the calculator: sellers / buyers, industrial plot, road premium, flat", () => {
  const ALAPUR = GUIDELINE_DATA.find((e) => e.sno === 820)!;

  it.each([
    ["1", { sellers: 1, buyers: 1 }],
    ["2 1", { sellers: 2, buyers: 1 }],
    ["2 विक्रेता 3 क्रेता", { sellers: 2, buyers: 3 }],
    ["sellers 2", { sellers: 2, buyers: 1 }],
  ])("parties %s", (text, want) => {
    expect(readParties(text)).toEqual(want);
  });

  it("2 sellers on farm land: the calculator's party multiplier", () => {
    const g = { mode: "guide" as const, step: "PARTIES" as const, amount: null, sno: 820, type: "agri" as const, agriArea: { value: 0.209, unit: "hect" as const }, diverted: "no" as const };
    const t = guideReply(g, "2 1", fees);
    const want = agriValue({ entry: ALAPUR, areaSqm: 2090, irrigated: true, zone: "nigam1", sellers: 2, buyers: 1 });
    expect(t.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.total).toLocaleString("en-IN")}`);
    expect(t.replies[0]).toContain("मान्यता: विक्रेता 2 और क्रेता 1;");
  });

  it("industrial plot (menu 7) and a stated road premium use plotValue", () => {
    const g = { mode: "guide" as const, step: "TYPE" as const, amount: null, sno: 820, roadPct: 10 };
    let t = guideReply(g, "7", fees);
    t = guideReply(t.state!, "300 sqm", fees);
    t = guideReply(t.state!, "2", fees);
    t = guideReply(t.state!, "2", fees);
    const want = plotValue({ entry: ALAPUR, areaSqm: 300, use: "ind", roadPct: 10 });
    expect(t.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.value).toLocaleString("en-IN")}`);
    expect(t.replies[0]).toContain("औद्योगिक भूखण्ड");
    expect(t.replies[0]).toContain("सड़क प्रीमियम 10%");
    expect(guideFacts("road premium 20% wala plot").roadPct).toBe(20);
  });

  it("residential flat: area → use → floor → lift → flatValue", () => {
    let t = guideNext(start("Alapur mukhya road flat 1200 sqft", null), fees);
    t = guideReply(t.state!, "1", fees); // the row
    expect(t.replies).toEqual([GUIDE_ASK_FLAT_USE]);
    t = guideReply(t.state!, "1", fees);
    expect(t.replies).toEqual([GUIDE_ASK_FLOOR]);
    t = guideReply(t.state!, "2", fees);
    expect(t.replies).toEqual([GUIDE_ASK_LIFT]);
    t = guideReply(t.state!, "2", fees);
    const want = flatValue({ entry: ALAPUR, areaSqm: plotAreaToSqm(1200, "sqft"), commercial: false, floorIdx: 2, lift: false });
    expect(t.outcome).toBe("answered");
    expect(t.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.value).toLocaleString("en-IN")}`);
    expect(t.replies[0]).toContain("× 0.9 (मंज़िल)");
  });

  it("commercial flat: the calculator's floor factors (ground 100, mezzanine 90, 1st 80, 2nd 70, 3rd+ 60%)", () => {
    const g = { mode: "guide" as const, step: "FLOOR" as const, amount: null, sno: 820, type: "flat" as const, area: { value: 50, unit: "sqm" as const }, flatCom: true };
    for (const [ans, f] of [["0", 1], ["M", 0.9], ["1", 0.8], ["2", 0.7], ["5", 0.6]] as const) {
      const t = guideReply(g, ans, fees);
      const want = flatValue({ entry: ALAPUR, areaSqm: 50, commercial: true, commercialFloorFactor: f });
      expect(t.outcome).toBe("answered");
      expect(t.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.value).toLocaleString("en-IN")}`);
    }
    // Mezzanine is asked again for a residential flat.
    expect(guideReply({ ...g, flatCom: false }, "M", fees).replies).toEqual([GUIDE_ASK_FLOOR]);
  });
});

describe("house / shop building (the office calculator's bldg mode)", () => {
  const ALAPUR = GUIDELINE_DATA.find((e) => e.sno === 820)!;
  const sqft = (v: number) => plotAreaToSqm(v, "sqft");

  it("reads the construction kind, floors and age", () => {
    expect(readBuildKind("1", false)).toBe("rcc");
    expect(readBuildKind("पक्की छत", false)).toBe("rcc");
    expect(readBuildKind("tin shed", false)).toBe("tin");
    expect(readBuildKind("2", true)).toBe("office");
    expect(readBuildKind("गोदाम", true)).toBe("godown");
    expect(readFloors("1000, 800 sqft", "sqm")).toEqual([sqft(1000), sqft(800)]);
    expect(readFloors("1000", "sqft")).toEqual([sqft(1000)]);
    expect(readFloors("2 मंज़िल, हर मंज़िल 900 वर्गफुट", "sqm")).toEqual([sqft(900), sqft(900)]);
    expect(readFloors("भूतल 100 वर्गमीटर, 1st floor 80", "sqft")).toEqual([100, 80]);
    expect(readFloors("pata nahi", "sqft")).toBeNull();
    expect(readAge("12 साल")).toBe(12);
    expect(readAge("नया है")).toBe(0);
    expect(readAge("pata nahi")).toBeNull();
  });

  it("house: plot → corner → RCC → floors → age → buildingValue, with the amount warning", () => {
    let t = guideNext(start("Alapur mukhya road makan guideline", 2_000_000), fees);
    t = guideReply(t.state!, "1", fees); // the row
    expect(t.replies).toEqual([GUIDE_ASK_HOUSE_PLOT]);
    t = guideReply(t.state!, "1500 sqft", fees);
    t = guideReply(t.state!, "2", fees); // not corner
    expect(t.replies).toEqual([GUIDE_ASK_HOUSE_KIND]);
    t = guideReply(t.state!, "1", fees);
    expect(t.replies).toEqual([GUIDE_ASK_FLOORS]);
    t = guideReply(t.state!, "1200, 1000", fees);
    expect(t.replies).toEqual([GUIDE_ASK_AGE]);
    t = guideReply(t.state!, "15", fees);
    const want = buildingValue({ entry: ALAPUR, plotSqm: sqft(1500), corner: false, rescom: false, floors: [{ age: 15, parts: { rcc: sqft(1200) } }, { age: 15, parts: { rcc: sqft(1000) } }] });
    expect(t.outcome).toBe("answered");
    expect(t.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.total).toLocaleString("en-IN")}`);
    expect(t.replies[0]).toContain("अवक्षयण 10%");
    expect(t.replies[0]).toContain("पहली मंज़िल");
    expect(t.replies[0]).toContain("⚠️ चेतावनी");
  });

  it("shop: commercial plot rate and shop construction", () => {
    const g = { mode: "guide" as const, step: "BUILD_KIND" as const, amount: null, sno: 820, type: "shop" as const, area: { value: 50, unit: "sqm" as const }, corner: true };
    let t = guideReply(g, "1", fees);
    t = guideReply(t.state!, "40 वर्गमीटर", fees);
    t = guideReply(t.state!, "0", fees);
    const want = buildingValue({ entry: ALAPUR, plotSqm: 50, corner: true, rescom: true, floors: [{ age: 0, parts: { shop: 40 } }] });
    expect(t.replies[0]).toContain(`गाइडलाइन मूल्य: ₹${Math.round(want.total).toLocaleString("en-IN")}`);
    expect(t.replies[0]).toContain("व्यावसायिक भूखण्ड दर + कॉर्नर 10%");
    expect(guideReply(g, "5", fees).replies[0]).toContain(GUIDE_ASK_SHOP_KIND);
  });
});
