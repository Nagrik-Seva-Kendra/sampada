import { describe, expect, it } from "vitest";
import { boundaryBlock, plotBlock } from "./colony-rules.js";
import { buildSetupSuggestion, colonyDeedFacts, developerOf, markProjectTemplate, partnerNames, personKey, sellerSection, soldPlotsOf } from "./colony-setup.js";

const Z = "‍";
const prop = (plotLine: string, blockLine: string | null, bounds = ["कॉलौनी रोड", "प्लाट 5", "प्लाट 3", "30 फीट रोड"]) =>
  [
    `यह कि विक्रेता फर्म की भूमि ग्राम डोंगरपुर पुतलीघर का विक्रीत प्लाट :-`,
    plotLine,
    ...(blockLine ? [blockLine] : []),
    `क्षेत्रफल - 30 फीट x 50 फीट कुल 1500 वर्गफीट`,
    `चतुर्सीमा :-`,
    `पूरब - ${bounds[0]}`,
    `पश्चिम - ${bounds[1]}`,
    `उत्तर - ${bounds[2]}`,
    `दक्षिण - ${bounds[3]}`,
  ].join("\n");

describe("follow-up: blocks, several plots, neighbours, partners, corner", () => {
  it("1. each Hindi block letter, whole token, from the line next to the plot -- never a 'ब्लॉक' elsewhere in the deed", () => {
    for (const [hi, en] of [["ए", "A"], ["बी", "B"], ["सी", "C"], ["डी", "D"], ["ई", "E"]] as const) {
      const text = `विक्रेता का कार्यालय ब्लॉक बी, सिटी सेंटर\n\n${prop("प्लाट क्रमांक - 19", `ब्${Z}लॉक - ${hi}`)}`;
      expect([hi, soldPlotsOf(text).plots]).toEqual([hi, [{ block: en, plotNo: "19", blockFrom: "blockLine" }]]);
    }
    // legacy-6873: "प्लाट क्रमांक - 19" / "ब्‍लॉक - डी", neighbours डी-18, डी-20 → D-19 (not B-19).
    expect(soldPlotsOf(prop("प्लाट क्रमांक - 19", `ब्${Z}लॉक - डी`, ["डी-18", "डी-20", "डी-36", "रोड"])).plots[0]).toMatchObject({ block: "D", plotNo: "19" });
  });

  it("2. one deed, several plots: '05 व 06', '9, 10 व 11', '&', 'एवं' -- every plot sold from that deed", () => {
    const nos = (line: string, block: string) => soldPlotsOf(prop(line, `ब्लॉक - ${block}`)).plots.map((p) => `${p.block}-${p.plotNo}`);
    expect(nos("प्लाट क्रमांक - 05 व 06", "सी")).toEqual(["C-5", "C-6"]);
    expect(nos("प्लाट क्रमांक - 9, 10 व 11", "बी")).toEqual(["B-9", "B-10", "B-11"]);
    expect(nos("प्लाट क्रमांक - 7 & 8", "ई")).toEqual(["E-7", "E-8"]);
    expect(nos("प्लाट क्रमांक - 12 एवं 13", "ए")).toEqual(["A-12", "A-13"]);
    const s = buildSetupSuggestion([{ id: "v", title: "वर्षा शर्मा C-5 व 6", content: prop("प्लाट क्रमांक - 05 व 06", "ब्लॉक - सी") }], ["FLORA CITY"]);
    expect(s.plots.map((p) => [`${p.block}-${p.plotNo}`, p.from.deedId, p.areaSqft])).toEqual([
      ["C-5", "v", null],
      ["C-6", "v", null],
    ]);
  });

  it("3. no block line: title, else the neighbours' majority block; else 'block not found' and not imported", () => {
    expect(soldPlotsOf(prop("प्लाट क्रमांक - 37", null, ["ए-4", "ए-38", "ए-36", "रोड"])).plots[0]).toMatchObject({ block: "A", plotNo: "37", blockFrom: "neighbours" });
    expect(soldPlotsOf(prop("प्लाट क्रमांक - 37", null), "विक्रय पत्र E-37").plots[0]).toMatchObject({ block: "E", blockFrom: "title" });
    const s = buildSetupSuggestion([{ id: "x", title: "अनूप तिवारी एचयूएफ", content: prop("प्लाट क्रमांक - 37", null) }], ["FLORA CITY"]);
    expect(s.plots).toEqual([]);
    expect(s.unplaced).toEqual([{ plotNo: "37", from: { deedId: "x", title: "अनूप तिवारी एचयूएफ" }, reason: "ब्लॉक नहीं मिला" }]);
    expect(s.warnings.join("\n")).toContain("ब्लॉक डीड से पता नहीं चला");
  });

  it("corner suffix in the plot no. sets Corner and is dropped from the number (E-43, E-44, D-27)", () => {
    expect(soldPlotsOf(prop("प्लाट क्रमांक - E-43 (कॉर्नर)", null))).toEqual({ corner: true, plots: [{ block: "E", plotNo: "43", blockFrom: "plotNo" }] });
    expect(soldPlotsOf(prop("प्लाट क्रमांक - 44 कॉर्नर", "ब्लॉक - ई")).plots[0]).toMatchObject({ block: "E", plotNo: "44" });
    expect(soldPlotsOf(prop("प्लाट क्रमांक - डी-27 कोर्नर", null))).toMatchObject({ corner: true, plots: [{ block: "D", plotNo: "27" }] });
    expect(soldPlotsOf(prop("प्लाट क्रमांक - 19", "ब्लॉक - डी")).corner).toBe(false);
  });

  it("4. partners grouped by the persons (लाधा = लढ्ढा, joiners ignored), seller over several paragraphs, named by the pair, most used first", () => {
    const seller = (a: string, b: string | null) =>
      `विक्रेता पक्ष :- मैसर्स ग्रीन इन्${Z}फ्राटेक (Pan No. AAKFG1234B) द्वारा पार्टनर\n1. श्री ${a} पुत्र श्री पिता निवासी ग्वालियर${b ? `\n\n2. श्री ${b} पुत्र स्व.श्री पिता निवासी ग्वालियर` : ""}\n\nक्रेता पक्ष :- श्री ग्राहक पुत्र श्री पिता`;
    expect(partnerNames(sellerSection(seller("आयुष लाधा", "रोहित वाधवा")))).toEqual(["आयुष लाधा", "रोहित वाधवा"]);
    expect(personKey("आयुष लाधा")).toBe(personKey(`आयुष ल${Z}ढ्ढा`));
    const deeds = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, title: `E-${i + 1}`, content: seller(i % 2 ? "आयुष लाधा" : "आयुष लढ्ढा", "रोहित वाधवा") + "\n\n" + prop(`प्लाट क्रमांक - ${i + 1}`, "ब्लॉक - ई") })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `m${i}`, title: `D-${i + 1}`, content: seller("आयुष लाधा", "महेश भारद्वाज") + "\n\n" + prop(`प्लाट क्रमांक - ${i + 1}`, "ब्लॉक - डी") })),
      { id: "s", title: "B-1", content: seller("रोहित वाधवा", null) + "\n\n" + prop("प्लाट क्रमांक - 1", "ब्लॉक - बी") },
    ];
    const s = buildSetupSuggestion(deeds, ["FLORA CITY"]);
    expect(s.partners.map((p) => p.label)).toEqual(["आयुष-रोहित", "आयुष-महेश", "रोहित"]);
    expect(s.warnings.join("\n")).toContain("आयुष-रोहित (4 डीड), आयुष-महेश (2 डीड), रोहित (1 डीड)");
    expect(s.partners[0]!.text).toContain("रोहित वाधवा");
    // Two different "आयुष" (different surnames) never share a label.
    const two = buildSetupSuggestion(
      [
        { id: "a1", title: "E-1", content: seller("आयुष लाधा", "रोहित वाधवा") + "\n\n" + prop("प्लाट क्रमांक - 1", "ब्लॉक - ई") },
        { id: "a2", title: "E-2", content: seller("आयुष अग्रवाल", "रोहित वाधवा") + "\n\n" + prop("प्लाट क्रमांक - 2", "ब्लॉक - ई") },
      ],
      ["FLORA CITY"],
    );
    expect(two.partners.map((p) => p.label).sort()).toEqual(["आयुष अग्रवाल-रोहित", "आयुष लाधा-रोहित"]);
    // The whole seller part (both paragraphs) becomes {{PARTNER}}.
    const tpl = markProjectTemplate(deeds[0]!.content).template;
    expect(tpl).not.toContain("रोहित वाधवा");
    expect(tpl.match(/\{\{PARTNER\}\}/g)).toHaveLength(1);
  });
});

// ---------- 5. Woods (shops): only this project's deeds; a company seller; the shop-deed shape ----------
const WOODS = (unit: string, floor: string) =>
  [
    "विक्रय विलेख",
    `विक्रेता पक्ष - ब्${Z}लू लोटस रियल्${Z}टर्स प्रा.लि. द्वारा डायरेक्${Z}टर\nश्री रोहित वाधवा पुत्र स्${Z}व.श्री पी.सी.वाधवा (PAN ABCDE1234F)\nनिवासी- कृष्${Z}ण कुंज, गांधी रोड, ग्${Z}वालियर`,
    "क्रेता पक्ष - श्रीमती ग्राहक पत्नी श्री पति आधार 2345 6789 0123",
    `प्रकोष्${Z}ठ/SHOP स्थित - WOODS BUSINESS COURTYARD, ग्राम सिरौल, वार्ड 61\nप्रकोष्${Z}ठ/SHOP क्रमांक - ${unit}\nफ्${Z}लोर - ${floor}\nएरिया - 168.8 वर्गफुट यानि 15.68 वर्गमीटर है।`,
    "जिसकी चतुःसीमा निम्नानुसार है :-\nपूरब दिशा में : कॉरिडोर\nपश्चिम दिशा में : SHOP TF-22\nउत्तर दिशा में : SHOP TF-20\nदक्षिण दिशा में : खुला",
    "यह कि उपरोक्त वर्णित प्रकोष्ठ/SHOP विक्रेता पक्ष ने आप क्रेता पक्ष को कीमत 25,00,000/- रूपये में विक्रय किया है जिसका भुगतान निम्नानुसार प्राप्त किया :-\n1. चैक क्रमांक 111 रूपये 5,00,000/-\n2. RTGS UTR नं. X रूपये 20,00,000/-",
    "यह कि विक्रेता पक्ष ने क्रेता पक्ष को उक्त प्रकोष्ठ का रिक्त एवं मूर्तिमंत कब्जा आज दे दिया है, मेन्टेनेन्स चार्ज क्रेता देगा।",
    "यह कि प्रकोष्ठ के रख-रखाव हेतु क्रेता 2 रूपये प्रतिवर्गफुट प्रतिमाह की दर से मेन्टेनेन्स राशि सोसायटी को देगा तथा सोसायटी के नियम मानेगा।",
    "इति ग्वालियर, दिनांक 28.09.2026",
  ].join("\n\n");
const FLORA_PLOT = `विक्रय पत्र\n\nविक्रेता पक्ष :- मैसर्स ग्रीन इन्फ्राटेक द्वारा पार्टनर श्री आयुष लाधा पुत्र श्री पिता\n\nक्रेता पक्ष :- श्री क\n\n${prop("प्लाट क्रमांक - 5", "ब्लॉक - ई")}`;

describe("follow-up 5: Woods Business Courtyard", () => {
  it("company seller: 'ब्लू लोटस रियल्टर्स प्रा.लि. द्वारा डायरेक्टर' + the signer, not the father", () => {
    expect(developerOf("ब्लू लोटस रियल्टर्स प्रा.लि. द्वारा डायरेक्टर श्री रोहित")).toBe("ब्लू लोटस रियल्टर्स प्रा.लि.");
    expect(developerOf("XYZ Developers Pvt. Ltd. द्वारा अधिकृत हस्ताक्षरकर्ता")).toBe("XYZ Developers Pvt. Ltd.");
    const f = colonyDeedFacts(WOODS("TF - 21", "Third"), "शॉप SHOP क्रमांक - TF - 21 WOODS BUSINESS COURTYARD");
    expect(f.developer).toBe("ब्लू लोटस रियल्टर्स प्रा.लि.");
    expect(f.partners).toEqual(["रोहित वाधवा"]);
    expect(f.kind).toBe("SHOP");
    expect(f.plot).toMatchObject({ plotNo: "TF-21", floor: "Third", areaSqft: 168.8, east: "कॉरिडोर", west: "SHOP TF-22" });
  });

  it("only this project's kind of deed is used; a Flora plot deed never fills Woods; nothing found → empty", () => {
    const s = buildSetupSuggestion(
      [
        { id: "flora", title: "प्लाट ग्राम डोंगरपुर पुतलीघर, फ्लोरा सिटी", content: FLORA_PLOT },
        { id: "w21", title: "TF-21", content: WOODS("TF - 21", "Third") },
        { id: "w12", title: "FF-12", content: WOODS("FF - 12", "First") },
      ],
      ["WOODS BUSINESS COURTYARD"],
      "SHOP",
    );
    expect(s.developer).toMatchObject({ value: "ब्लू लोटस रियल्टर्स प्रा.लि." });
    expect(s.developer!.from.map((x) => x.deedId)).toEqual(["w21", "w12"]);
    expect(JSON.stringify(s)).not.toContain("ग्रीन इन्फ्राटेक");
    expect(s.template!.from[0]!.deedId).not.toBe("flora");
    expect(s.partners.map((p) => p.label)).toEqual(["रोहित"]);
    expect(s.plots.map((p) => [p.plotNo, p.floor])).toEqual([["TF-21", "Third"], ["FF-12", "First"]]);
    expect(s.warnings.join("\n")).toContain("1 डीड इस प्रोजेक्ट के प्रकार की नहीं");
    const none = buildSetupSuggestion([{ id: "flora", title: "x", content: FLORA_PLOT }], ["WOODS"], "SHOP");
    expect([none.developer, none.template, none.partners.length]).toEqual([null, null, 0]);
  });

  it("shop standard text cut from a Woods deed; maintenance = the रख-रखाव paragraph, never the possession one", () => {
    const s = buildSetupSuggestion([{ id: "w21", title: "TF-21", content: WOODS("TF - 21", "Third") }], ["WOODS"], "SHOP");
    const tpl = s.template!.value;
    expect(tpl).toContain("प्रकोष्ठ/SHOP स्थित - WOODS BUSINESS COURTYARD");
    expect(tpl).toContain("{{PLOT}}");
    expect(tpl).toContain("जिसकी चतुःसीमा निम्नानुसार है :-\n{{BOUNDARY}}");
    for (const left of ["TF - 21", "Third", "168.8", "कॉरिडोर", "25,00,000", "UTR", "चैक क्रमांक", "2345 6789", "ABCDE1234F", "रोहित वाधवा"]) expect([left, tpl.includes(left)]).toEqual([left, false]);
    for (const m of ["{{PARTNER}}", "{{BUYER}}", "{{PAYMENT}}", "{{MAINTENANCE}}"]) expect(tpl).toContain(m);
    expect(tpl).toContain("रिक्त एवं मूर्तिमंत कब्जा"); // possession stays literal
    expect(s.maintenanceClauses.map((m) => m.value)).toEqual([expect.stringContaining("प्रतिवर्गफुट")]);
    // The generator writes the unit and boundaries in the same wording.
    expect(plotBlock({ block: "", plotNo: "TF-21", ewFt: null, nsFt: null, areaSqft: 168.8, floor: "तृतीय तल" }, "SHOP")).toBe(
      "प्रकोष्ठ/SHOP क्रमांक - TF - 21\nफ्लोर - Third\nएरिया - 168.8 वर्गफुट यानि 15.68 वर्गमीटर है।",
    );
    expect(boundaryBlock({ east: "कॉरिडोर", west: null, north: null, south: null }, "SHOP")).toBe("पूरब दिशा में : कॉरिडोर\nपश्चिम दिशा में : ____\nउत्तर दिशा में : ____\nदक्षिण दिशा में : ____");
  });
});
