import { describe, expect, it } from "vitest";
import { blockAndPlot, buildSetupSuggestion, colonyDeedFacts, devanagariForms, markProjectTemplate, templateLeftovers, villageOf } from "./colony-setup.js";

/** A Flora City deed the way the office types it in Word: invisible joiners (U+200D) inside words. */
const ZWJ = "‍";
const DEV_PARA =
  "यह कि उक्त कॉलोनी का विकास नगर तथा ग्राम निवेश ग्वालियर म.प्र. के पत्र क्रमांक 1234/LP/2019 दिनांक 10.02.2019 द्वारा अभिन्यास अनुमोदन तथा कलेक्टर ग्वालियर के कॉलोनी विकास अनुमति आदेश क्रमांक 55/2019 दिनांक 15.03.2019 के अनुसार किया गया है " +
  "और कॉलोनी में सड़क, नाली, बिजली, पानी की सभी सुविधाएँ विकसित की गई हैं ".repeat(16).trim() +
  "।";
const MAINT =
  "यह कि कॉलोनी के रखरखाव का शुल्क क्रेता रजिस्ट्री दिनांक से प्रति माह विक्रेता फर्म अथवा रहवासी समिति को देय होगा तथा सड़क बिजली पानी की व्यवस्था का रखरखाव समिति करेगी।";
function deed(o: { pair: [string, string] | [string]; plotNo: string; block: string; south?: string; buyer: string; date: string; corner?: boolean }) {
  const [a, b] = o.pair;
  return [
    `विक्रय पत्र`,
    `विक्रेता पक्ष :- मैसर्स ग्रीन इन्${ZWJ}फ्राटेक (Pan No. AAKFG1234B) द्वारा पार्टनर श्री ${a} पुत्र श्री पिता${b ? ` एवं श्री ${b} पुत्र श्री पिता` : ""} निवासी ग्वालियर`,
    `क्रेता पक्ष :- श्री ${o.buyer} पुत्र श्री पिता आधार नं. 2345 6789 0123 मोबाइल 9876543210`,
    DEV_PARA,
    `यह कि विक्रेता फर्म की भूमि ग्राम डोंगरपुर पुतलीघर, तह. गिर्द जिला ग्वालियर सर्वे क्रमांक - 101, 102/1 पर विकसित फ्लोरा सिटी का विक्रीत प्लाट :-\nप्लाट क्रमांक - ${o.plotNo}${o.corner ? " (कॉर्नर)" : ""}\nब्${ZWJ}लॉक - ${o.block}\nक्षेत्रफल - 30 फीट x 50 फीट कुल 1500 वर्गफीट\nचतुर्सीमा :-\nपूरब - कॉलौनी रोड\nपश्चिम - प्लाट 5\nउत्तर - प्लाट 3\nदक्षिण - ${o.south ?? "30 फीट रोड"}`,
    `यह कि उक्त विक्रीत प्लाट का बिक्रीधन 36,00,000/- रूपये (छत्तीस लाख रूपये) विक्रेता फर्म ने क्रेता से निम्नानुसार प्राप्त कर लिया है :-\n1. चैक क्रमांक 123456 दिनांक 01.09.2026 रूपये 5,00,000/-\n2. आर.टी.जी.एस. UTR नं. SBIN12345 रूपये 10,00,000/-\n3. डी.डी. क्रमांक 998877 रूपये 21,00,000/-`,
    `अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।`,
    MAINT,
    `इति ग्वालियर, दिनांक ${o.date}`,
  ].join("\n\n");
}

const D = (id: string, title: string, o: Parameters<typeof deed>[0]) => ({ id, title, content: deed(o), date: new Date("2026-01-01") });
const DEEDS = [
  D("e20", "विक्रय पत्र फ्लोरा सिटी", { pair: ["आयुष अग्रवाल", "रोहित जैन"], plotNo: "20", block: "ई", buyer: "राम", date: "05.10.2026" }),
  D("b20", "विक्रय पत्र फ्लोरा सिटी", { pair: ["आयुष अग्रवाल", "रोहित जैन"], plotNo: "20", block: "बी", buyer: "श्याम", date: "04.10.2026", corner: true }),
  D("c20", "विक्रय पत्र फ्लोरा सिटी C-20", { pair: ["आयुष अग्रवाल", "रोहित जैन"], plotNo: "C-20", block: "सी", buyer: "गीता", date: "03.10.2026" }),
  D("b4a", "विक्रय पत्र प्लाट बी-04", { pair: ["आयुष अग्रवाल", "महेश गुप्ता"], plotNo: "बी-04", block: "बी", buyer: "सीता", date: "02.10.2026" }),
  D("b4b", "विक्रय पत्र B-4 पुनर्विक्रय", { pair: ["आयुष अग्रवाल", "महेश गुप्ता"], plotNo: "4", block: "बी", buyer: "मोहन", date: "01.05.2025" }),
  D("lig", "विक्रय पत्र LIG-12 फ्लोरा", { pair: ["रोहित जैन"], plotNo: "LIG-12", block: "एल.आई.जी.", buyer: "रवि", date: "01.04.2025" }),
  D("mst", `मास्${ZWJ}टर डीड फ्लोरा सिटी`, { pair: ["आयुष अग्रवाल", "रोहित जैन"], plotNo: "1", block: "ए", buyer: "कंपनी", date: "01.01.2019" }),
];

describe("Setup from old deeds -- real Flora deeds", () => {
  it("1. block from the plot no., the 'ब्‍लॉक - ई' line (with joiners) or the title; Hindi letters → A..E, LIG", () => {
    expect(blockAndPlot(deed({ pair: ["क"], plotNo: "20", block: "ई", buyer: "x", date: "01.01.2026" }))).toEqual({ block: "E", plotNo: "20" });
    expect(blockAndPlot("प्लाट क्रमांक - बी-04")).toEqual({ block: "B", plotNo: "4" });
    expect(blockAndPlot("प्लाट नं. E-28")).toEqual({ block: "E", plotNo: "28" });
    expect(blockAndPlot("प्लाट क्रमांक - LIG-12")).toEqual({ block: "LIG", plotNo: "12" });
    expect(blockAndPlot("प्लाट क्रमांक - 22", "विक्रय पत्र C-22")).toEqual({ block: "C", plotNo: "22" });
    expect(blockAndPlot("कुछ नहीं", "शीर्षक")).toBeNull();
  });

  it("1-2. sold plots keyed by block + plot (E-20 / B-20 / C-20 distinct), carrying size, boundaries, corner; real repeats with both deeds + dates; master deed not a sale", () => {
    const s = buildSetupSuggestion(DEEDS, ["FLORA CITY", ...devanagariForms("FLORA CITY")]);
    expect(s.plots.map((p) => `${p.block}-${p.plotNo}`)).toEqual(["E-20", "B-20", "C-20", "B-4", "LIG-12"]);
    expect(s.plots[1]).toMatchObject({ block: "B", plotNo: "20", ewFt: 30, nsFt: 50, areaSqft: 1500, east: "कॉलौनी रोड", west: "प्लाट 5", north: "प्लाट 3", south: "30 फीट रोड", corner: true });
    const w = s.warnings.join("\n");
    expect(w).toContain('ब्लॉक B प्लाट 4: 2 डीड — "विक्रय पत्र प्लाट बी-04" (02/10/2026), "विक्रय पत्र B-4 पुनर्विक्रय" (01/05/2025)');
    expect(w).not.toMatch(/प्लाट 20: 2 डीड/);
    expect(s.plots.some((p) => p.plotNo === "1")).toBe(false); // master deed
  });

  it("3-4. village from the property line, never 'निवेश ग्वालियर म'; developer 'मैसर्स …' without the PAN", () => {
    const f = colonyDeedFacts(DEEDS[0]!.content, DEEDS[0]!.title);
    expect(f.village).toBe("डोंगरपुर पुतलीघर");
    expect(villageOf("नगर तथा ग्राम निवेश ग्वालियर म.प्र. … सर्वे क्रमांक - ग्राम डोंगरपुर पुतलीघर, तह. गिर्द")).toBe("डोंगरपुर पुतलीघर");
    expect(f.developer).toBe("मैसर्स ग्रीन इन्फ्राटेक");
    expect(f.partners).toEqual(["आयुष अग्रवाल", "रोहित जैन"]);
  });

  it("5-6. whole permission (1300+ chars) and maintenance paragraphs into the fields; standard text has only placeholders for plot, boundaries and payment", () => {
    const s = buildSetupSuggestion(DEEDS, ["FLORA CITY"]);
    expect(DEV_PARA.length).toBeGreaterThan(1300);
    expect(s.devPermissions[0]!.value).toBe(DEV_PARA);
    expect(s.maintenanceClauses[0]!.value).toBe(MAINT);
    const tpl = s.template!.value;
    for (const m of ["{{PARTNER}}", "{{BUYER}}", "{{DEV_PERMISSION}}", "{{PLOT}}", "{{BOUNDARY}}", "{{PAYMENT}}", "{{MAINTENANCE}}"]) expect(tpl.split(m)).toHaveLength(2);
    for (const left of ["ब्लॉक", "कॉलौनी रोड", "36,00,000", "UTR", "चैक क्रमांक", "डी.डी.", "लेना देना", "AAKFG1234B", "2345 6789", "9876543210", "श्री राम"]) expect([left, tpl.includes(left)]).toEqual([left, false]);
    expect(tpl).toContain("विक्रेता पक्ष :- {{PARTNER}}");
    expect(tpl).toContain("इति ग्वालियर, दिनांक ____");
    expect(templateLeftovers(tpl)).toEqual([]);
    expect(markProjectTemplate(DEEDS[0]!.content).found.sort()).toEqual(["{{BOUNDARY}}", "{{BUYER}}", "{{DEV_PERMISSION}}", "{{MAINTENANCE}}", "{{PARTNER}}", "{{PAYMENT}}", "{{PLOT}}"]);
  });

  it("6. save-time check: amount, UTR, cheque no., DD, a 'ब्लॉक -' line", () => {
    expect(templateLeftovers("{{PLOT}}\nब्‍लॉक - ई\n{{PAYMENT}}\n2. आर.टी.जी.एस. UTR नं. X रूपये 10,00,000/-\nचैक क्रमांक 1\nडी.डी. 2")).toEqual([
      "राशि (जैसे 36,00,000/- रूपये)",
      "UTR नंबर",
      "चैक क्रमांक",
      "डी.डी.",
      '"ब्लॉक -" वाली पंक्ति',
    ]);
  });

  it("7. partner variants named by the pair, most used first", () => {
    const s = buildSetupSuggestion(DEEDS, ["FLORA CITY"]);
    expect(s.partners.map((p) => p.label)).toEqual(["आयुष-रोहित", "आयुष-महेश", "रोहित"]);
    expect(new Set(s.partners.map((p) => p.key)).size).toBe(3);
  });

  it("8. the Devanagari form of a Latin name", () => {
    expect(devanagariForms("FLORA CITY")).toEqual(["फ्लोरा सिटी", "फ्लोरा"]);
    expect(devanagariForms("WOODS BUSINESS COURTYARD")[0]).toBe("वुड्स बिजनेस कोर्टयार्ड");
    expect(devanagariForms("फ्लोरा सिटी")).toEqual([]);
  });

  it("shops: 'शॉप SHOP क्रमांक - TF - 21 WOODS …' → TF-21 on तृतीय तल; 412 → चतुर्थ तल", () => {
    const f = colonyDeedFacts("विक्रय पत्र\n\nविक्रेता पक्ष :- मैसर्स वुड्स द्वारा पार्टनर श्री क\n\nशॉप SHOP क्रमांक - TF - 21 WOODS BUSINESS COURTYARD क्षेत्रफल 320 वर्गफीट");
    expect(f.kind).toBe("SHOP");
    expect(f.plot).toMatchObject({ block: "", plotNo: "TF-21", floor: "तृतीय तल", areaSqft: 320 });
    expect(colonyDeedFacts("शॉप क्रमांक - 412 क्षेत्रफल 300 वर्गफीट").plot).toMatchObject({ plotNo: "412", floor: "चतुर्थ तल" });
  });
});
