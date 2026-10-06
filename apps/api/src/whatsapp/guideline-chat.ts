/**
 * The WhatsApp guideline question ("Ganga vihar ward 60 ... 2770 sqft ka
 * guideline bata do"): what the customer's words say, the guideline rows they
 * may mean, the next question, and the answer. Pure (guideline-chat.spec.ts).
 *
 * The value always comes from the office calculator (guideline/calculator.ts:
 * plotValue + stampDuty) and the rows from guidelineCandidates() of the colony
 * setup -- nothing is copied, so the bot and the office tools agree. Nothing
 * is guessed: a missing locality / row / type / area / corner is asked, more
 * than one row is listed for the customer to choose.
 */
import { officeFeeFor, type WaOfficeFees } from "@sampada/shared";
import { guidelineCandidates } from "../colony/colony-setup.js";
import { GUIDELINE_DATA, type GuidelineEntry, plotAreaToSqm, plotValue, stampDuty } from "./guideline/calculator.js";
import { GUIDELINE_YEAR } from "./guideline/gwalior-2026-27.data.js";
import { inr, normDigits } from "./intake-rules.js";

export type GuideType = "plotRes" | "plotCom" | "house" | "shop" | "flat" | "agri";
export type GuideStep = "NAME" | "WARD" | "PICK" | "TYPE" | "AREA" | "CORNER";

export interface GuideState {
  mode: "guide";
  step: GuideStep;
  amount: number | null;
  name?: string | null;
  ward?: string | null;
  options?: number[];
  sno?: number | null;
  type?: GuideType | null;
  area?: { value: number; unit: "sqft" | "sqm" } | null;
  corner?: boolean | null;
}

export interface GuideFacts {
  name: string | null;
  ward: string | null;
  type: GuideType | null;
  area: { value: number; unit: "sqft" | "sqm" } | null;
  corner: boolean | null;
}

// ---------- reading the customer's words ----------
const WARD_RE = /(?:ward|वार्ड)\s*(?:no\.?|number|नं\.?|नंबर|क्र(?:मांक)?\.?)?\s*[-:#.]?\s*(\d{1,3})(?!\d)/i;
const SQFT = String.raw`sq\.?\s*f(?:ee|oo)?t|sq\.?\s*ft|sqft|square\s*f(?:ee|oo)t|वर्ग\s*फ़?ुट|वर्ग\s*फीट|फ़?ुट|फीट|feet|ft`;
const SQM = String.raw`sq\.?\s*m(?:tr|eter|etre|t)?s?|sqm|square\s*met(?:er|re)s?|वर्ग\s*मीटर|वर्गमीटर`;
const AREA_RE = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(${SQFT}|${SQM})(?![a-z])`, "i");
const DIMS_RE = /(\d+(?:\.\d+)?)\s*(?:x|×|\*|by|बाय)\s*(\d+(?:\.\d+)?)/i;
const AGRI_UNIT = /(\d+(?:\.\d+)?)\s*(हेक्टेयर|hect|hectare|एकड़|acre|बीघा|bigha)/i;

const HOUSE = /makan|मकान|house|\bghar\b|घर|kothi|कोठी|bana\s*hua|बना\s*हुआ|construction|निर्माण|duplex|डुप्लेक्स/i;
const SHOP = /dukan|दुकान|\bshop|showroom|शोरूम|office|ऑफिस|godown|गोदाम/i;
const FLAT = /\bflat|फ्लैट|फ़्लैट|apartment|अपार्टमेंट/i;
const AGRI = /kheti|खेती|कृषि|krishi|agri|\bkhet\b|खेत|zameen|ज़मीन|जमीन/i;
const PLOT = /plot|प्लॉट|प्लाट|भूखंड|भूखण्ड|khali|खाली/i;
const COMMERCIAL = /vyavsayik|vyavasayik|व्यावसायिक|व्यवसायिक|commercial|कमर्शियल/i;
const CORNER = /corner|कॉर्नर|कोर्नर|कार्नर/i;
const NOT_CORNER = /(corner|कॉर्नर|कोर्नर|कार्नर)\s*(nahi|nahin|nhi|नहीं|नही|not|no)\b|(nahi|नहीं|not|non|no)[\s-]*(corner|कॉर्नर|कोर्नर|कार्नर)/i;

/** Words that are never part of a locality name. */
const STOP = new Set(
  (
    "pe par hogi hoga ki ka ke k se me mein main mai rate rates hisaab hisab guideline guide line bata batao batado do dijiye " +
    "kya hai h the tha aur or and of in the registry ragistry plot makan dukan flat sqft sq ft feet ward no number colony area " +
    "पे पर होगी होगा की का के से में रेट हिसाब गाइडलाइन बता बताओ दो दीजिए क्या है और रजिस्ट्री प्लॉट मकान दुकान वार्ड नंबर " +
    "वर्गफुट वर्ग फुट फीट क्षेत्र एरिया मुझे mujhe hame hume please plz pls ji जी"
  ).split(" "),
);
const PLACE_WORD = /^(vihar|विहार|nagar|नगर|colony|कॉलोनी|कालोनी|puram|पुरम|enclave|इन्क्लेव|एन्क्लेव|एनक्लेव|park|पार्क|city|सिटी|kunj|कुंज|dham|धाम|bagh|बाग|ganj|गंज|pura|पुरा|vihar\d*)$/i;

const words = (s: string) => s.split(/[\s,;:!?।()"']+/).map((w) => w.replace(/^[.\-]+|[.\-]+$/g, "")).filter(Boolean);
const keep = (w: string) => !STOP.has(w.toLowerCase()) && !/\d/.test(w);

/** "Ganga vihar ward 60 ..." → "Ganga vihar": the words right before the ward, else around a place word. */
export function localityOf(text: string): string | null {
  const s = normDigits(text);
  const ward = WARD_RE.exec(s);
  const pick = (ws: string[]) => {
    const out: string[] = [];
    for (let i = ws.length - 1; i >= 0 && out.length < 5; i--) {
      if (!keep(ws[i]!)) {
        if (out.length) break;
        continue;
      }
      out.unshift(ws[i]!);
    }
    return out.length ? out.join(" ") : null;
  };
  if (ward) {
    const before = pick(words(s.slice(0, ward.index)));
    if (before) return before;
  }
  const ws = words(s);
  const i = ws.findIndex((w) => PLACE_WORD.test(w));
  if (i >= 0) return pick(ws.slice(0, i + 1));
  return null;
}

/** Everything the text says (null = not said). */
export function guideFacts(text: string): GuideFacts {
  const s = normDigits(text).replace(/(\d),(?=\d)/g, "$1");
  const ward = WARD_RE.exec(s)?.[1] ?? null;
  let area: GuideFacts["area"] = null;
  const a = AREA_RE.exec(s);
  // A bare "feet / फुट" under 100 is a road width or a side, not an area.
  const bareFeet = a && /^(फ़?ुट|फीट|feet|ft)$/i.test(a[2]!.trim()) && parseFloat(a[1]!) < 100;
  if (a && !bareFeet) area = { value: parseFloat(a[1]!), unit: new RegExp(`^(${SQM})$`, "i").test(a[2]!.trim()) ? "sqm" : "sqft" };
  else {
    const d = DIMS_RE.exec(s);
    if (d && parseFloat(d[1]!) <= 1000 && parseFloat(d[2]!) <= 1000) area = { value: parseFloat(d[1]!) * parseFloat(d[2]!), unit: "sqft" };
  }
  let type: GuideType | null = null;
  if (HOUSE.test(s)) type = "house";
  else if (SHOP.test(s)) type = "shop";
  else if (FLAT.test(s)) type = "flat";
  else if (AGRI.test(s) || AGRI_UNIT.test(s)) type = "agri";
  else if (PLOT.test(s)) type = COMMERCIAL.test(s) ? "plotCom" : "plotRes";
  const corner = NOT_CORNER.test(s) ? false : CORNER.test(s) ? true : null;
  return { name: localityOf(s), ward: ward ? String(Number(ward)) : null, type, area, corner };
}

// ---------- rows ----------
const wardOf = (e: { ward: string }) => (/^\d+$/.test(e.ward.trim()) ? String(Number(e.ward.trim())) : null);

/**
 * Guideline rows for a locality (colony setup's guidelineCandidates), only the
 * ward's if one is given, and only rows containing every word of the name.
 * Never picks one itself.
 */
export function guideRows(name: string, ward: string | null, data: GuidelineEntry[] = GUIDELINE_DATA): GuidelineEntry[] {
  const scored = guidelineCandidates([name], data, data.length);
  const bySno = new Map(data.map((e) => [e.sno, e]));
  let rows = scored.map((r) => bySno.get(r.sno)!).filter(Boolean);
  if (ward) rows = rows.filter((e) => wardOf(e) === ward);
  if (!rows.length) return [];
  // Every word of the name must be in the row ("VIHAR" alone is not "Ganga Vihar").
  const tokens = words(normDigits(name).toUpperCase()).filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  return rows.filter((e) => {
    const hay = `${e.hi} ${e.en}`.toUpperCase();
    return tokens.every((t) => hay.includes(t));
  });
}

const rowLabel = (e: GuidelineEntry) => {
  const name = e.hi.length > 90 ? `${e.hi.slice(0, 90)}…` : e.hi;
  return `क्र. ${e.sno} — ${name}${wardOf(e) ? ` (वार्ड ${wardOf(e)})` : ""} — भूखण्ड ₹${inr(e.pr)}/वर्गमीटर`;
};

// ---------- questions ----------
export const GUIDE_ASK_NAME = "गाइडलाइन के लिए कॉलोनी / मोहल्ले का नाम और वार्ड नंबर लिखें (जैसे: गंगा विहार वार्ड 60)।";
export const GUIDE_ASK_WARD = "इस नाम की कई पंक्तियाँ हैं। वार्ड नंबर लिखें (जैसे: वार्ड 60)।";
export const GUIDE_ASK_TYPE =
  "संपत्ति किस प्रकार की है? नंबर लिखें:\n1. खाली प्लॉट (आवासीय)\n2. खाली प्लॉट (व्यावसायिक)\n3. मकान (निर्माण सहित)\n4. दुकान / ऑफिस\n5. फ़्लैट\n6. खेती की ज़मीन";
export const GUIDE_ASK_AREA = "प्लॉट का क्षेत्रफल लिखें (जैसे: 2770 वर्गफुट, 257 वर्गमीटर या 30x40 फुट)।";
export const GUIDE_ASK_CORNER = "क्या प्लॉट कॉर्नर (दो तरफ़ सड़क) का है? नंबर लिखें:\n1. हाँ\n2. नहीं";
export const GUIDE_PDF_HINT = "सही गाइडलाइन के लिए उसी संपत्ति की पुरानी रजिस्ट्री की PDF या सभी पन्नों की फ़ोटो यहीं भेजें।";
export const GUIDE_DISCLAIMER = "⚠️ यह अनुमान है; अंतिम गणना संपदा पोर्टल पर होगी।";

export function pickText(rows: GuidelineEntry[]): string {
  const head = rows.length === 1 ? "गाइडलाइन तालिका (2026-27) में यह पंक्ति मिली — सही है तो 1 लिखें:" : "गाइडलाइन तालिका (2026-27) में ये पंक्तियाँ मिलीं — आपकी संपत्ति वाली का नंबर लिखें:";
  return [head, ...rows.map((e, i) => `${i + 1}. ${rowLabel(e)}`), "0. इनमें से कोई नहीं"].join("\n");
}

export const notFoundText = (name: string, ward: string | null) =>
  `गाइडलाइन तालिका में "${name}"${ward ? ` (वार्ड ${ward})` : ""} की पंक्ति नहीं मिली, इसलिए गाइडलाइन मूल्य अंदाज़े से नहीं बताया जा रहा। ${GUIDE_PDF_HINT}`;

const TYPE_LABEL: Record<GuideType, string> = { plotRes: "आवासीय प्लॉट", plotCom: "व्यावसायिक प्लॉट", house: "मकान", shop: "दुकान / ऑफिस", flat: "फ़्लैट", agri: "खेती की ज़मीन" };
export const unsupportedTypeText = (t: GuideType) =>
  `${TYPE_LABEL[t]} का गाइडलाइन मूल्य मंज़िल / निर्माण / सिंचाई जैसी बातों पर निर्भर है, इसलिए बॉट इसका अनुमान नहीं लगाता। ${GUIDE_PDF_HINT}`;

// ---------- answers to a question ----------
const bare = (s: string) => normDigits(s).trim().replace(/[.)।]$/, "");
export function readType(text: string): GuideType | null {
  const n = bare(text);
  const byNo: Record<string, GuideType> = { "1": "plotRes", "2": "plotCom", "3": "house", "4": "shop", "5": "flat", "6": "agri" };
  return byNo[n] ?? guideFacts(text).type;
}
export function readCorner(text: string): boolean | null {
  const n = bare(text).toLowerCase();
  if (/^(1|haan|han|ha|hn|yes|y|हाँ|हां|हा|जी हाँ)$/.test(n)) return true;
  if (/^(2|nahi|nahin|nhi|na|no|n|नहीं|नही|ना)$/.test(n)) return false;
  return guideFacts(text).corner;
}
export function readPick(text: string, n: number): number | "none" | null {
  const s = bare(text).toLowerCase();
  if (/^(0|koi nahi|koi nahin|none|कोई नहीं)$/.test(s)) return "none";
  const k = /^\d{1,2}$/.test(s) ? Number(s) : NaN;
  if (k >= 1 && k <= n) return k - 1;
  if (n === 1 && /^(haan|han|ha|yes|हाँ|हां|sahi|सही|ok|okay)$/.test(s)) return 0;
  return null;
}

// ---------- the answer ----------
/**
 * Guideline value of a plot by the office calculator (plotValue: road premium
 * 0, corner +10%, no नींव भरा premium) and the duties by its stampDuty() with
 * the registry amount as the consideration; the office fee slab is on the
 * higher of amount and guideline value.
 */
export function guideAnswer(
  input: { entry: GuidelineEntry; type: "plotRes" | "plotCom"; area: { value: number; unit: "sqft" | "sqm" }; corner: boolean; amount: number | null },
  fees: WaOfficeFees,
): { text: string; value: number; stamp: ReturnType<typeof stampDuty> } {
  const { entry, area, corner, amount } = input;
  const use = input.type === "plotCom" ? "com" : "res";
  const sqm = plotAreaToSqm(area.value, area.unit);
  const r = plotValue({ entry, areaSqm: sqm, use, corner });
  const value = Math.round(r.value);
  const st = stampDuty(r.value, entry, amount ?? 0);
  const base = Math.max(amount ?? 0, value);
  const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;
  const lines = [
    `📋 गाइडलाइन से रजिस्ट्री खर्च का अनुमान (${GUIDELINE_YEAR})`,
    `पंक्ति: ${rowLabel(entry).replace(/ — भूखण्ड.*$/, "")}`,
    `दर: ₹${inr(r.baseRate)} प्रति वर्गमीटर (${use === "com" ? "व्यावसायिक" : "आवासीय"} भूखण्ड)${corner ? " + कॉर्नर 10%" : ""}`,
    `क्षेत्रफल: ${area.value} ${area.unit === "sqft" ? "वर्गफुट" : "वर्गमीटर"}${area.unit === "sqft" ? ` = ${+sqm.toFixed(2)} वर्गमीटर` : ""}`,
    `गाइडलाइन मूल्य: ₹${inr(value)}`,
  ];
  if (amount) {
    lines.push(`रजिस्ट्री राशि: ₹${inr(amount)}${amount > value ? ` (गाइडलाइन से ₹${inr(amount - value)} ज़्यादा)` : amount < value ? " (गाइडलाइन से कम — शुल्क गाइडलाइन पर)" : ""}`);
  }
  lines.push(
    `स्टाम्प शुल्क: ₹${inr(st.male.stampDuty)} (${st.isNigam ? "नगर निगम क्षेत्र" : "अन्य क्षेत्र"} — गाइडलाइन पर ${pct(st.sdPct)}${st.excessAmt > 0 ? ` + ऊपर की राशि ₹${inr(Math.round(st.excessAmt))} पर ${st.isNigam ? "5.1%" : "2.1%"} = ₹${inr(st.excessDuty)}` : ""})`,
    `पंजीयन शुल्क: पुरुष / संयुक्त क्रेता 3% = ₹${inr(st.male.registration)}, केवल महिला क्रेता 1% = ₹${inr(st.female.registration)}`,
  );
  const fee = officeFeeFor("registry", base, fees);
  lines.push(fee == null ? "कार्यालय शुल्क: कार्यालय बताएगा" : `कार्यालय शुल्क: ₹${inr(fee)} (लेखन शुल्क सहित, ₹${inr(base)} पर — जो ज़्यादा हो)`);
  lines.push(
    "",
    `मान्यता: सड़क प्रीमियम 0%; नींव भरे प्लॉट का +10% नहीं जोड़ा गया${corner ? "" : "; कॉर्नर नहीं"}।`,
    GUIDE_DISCLAIMER,
    'नया ड्राफ्ट बनवाना हो तो "1" लिखें।',
  );
  return { text: lines.join("\n"), value, stamp: st };
}

// ---------- the conversation ----------
export interface GuideTurn {
  /** null = the guideline conversation is over. */
  state: GuideState | null;
  replies: string[];
  /** Why it ended without a value (for the log). */
  outcome?: "answered" | "not-found" | "unsupported-type";
}

/** Fill the state from what the text says, without overwriting answers already given. */
export function mergeFacts(g: GuideState, f: GuideFacts): GuideState {
  return {
    ...g,
    name: g.name ?? f.name,
    ward: g.ward ?? f.ward,
    type: g.type ?? f.type,
    area: g.area ?? f.area,
    corner: g.corner ?? f.corner,
  };
}

/** The next question, or the answer when everything is known. */
export function guideNext(g: GuideState, fees: WaOfficeFees, data: GuidelineEntry[] = GUIDELINE_DATA): GuideTurn {
  if (g.type && g.type !== "plotRes" && g.type !== "plotCom") {
    return { state: null, replies: [unsupportedTypeText(g.type)], outcome: "unsupported-type" };
  }
  if (!g.sno) {
    if (!g.name) return { state: { ...g, step: "NAME" }, replies: [GUIDE_ASK_NAME] };
    const rows = guideRows(g.name, g.ward ?? null, data);
    if (!rows.length) return { state: null, replies: [notFoundText(g.name, g.ward ?? null)], outcome: "not-found" };
    if (!g.ward && rows.length > 5) return { state: { ...g, step: "WARD" }, replies: [GUIDE_ASK_WARD] };
    const shown = rows.slice(0, 9);
    return { state: { ...g, step: "PICK", options: shown.map((e) => e.sno) }, replies: [pickText(shown)] };
  }
  if (!g.type) return { state: { ...g, step: "TYPE" }, replies: [GUIDE_ASK_TYPE] };
  if (!g.area) return { state: { ...g, step: "AREA" }, replies: [GUIDE_ASK_AREA] };
  if (g.corner == null) return { state: { ...g, step: "CORNER" }, replies: [GUIDE_ASK_CORNER] };
  const entry = data.find((e) => e.sno === g.sno)!;
  const a = guideAnswer({ entry, type: g.type, area: g.area, corner: g.corner, amount: g.amount }, fees);
  return { state: null, replies: [a.text], outcome: "answered" };
}

/** The customer's answer to the current question; an unclear answer repeats the question with a hint. */
export function guideReply(g: GuideState, text: string, fees: WaOfficeFees, data: GuidelineEntry[] = GUIDELINE_DATA): GuideTurn {
  const f = guideFacts(text);
  let next: GuideState = g;
  let unclear: string | null = null;
  switch (g.step) {
    case "NAME": {
      const name = f.name ?? (words(normDigits(text)).filter(keep).join(" ") || null);
      if (!name) unclear = GUIDE_ASK_NAME;
      next = { ...g, name, ward: g.ward ?? f.ward };
      break;
    }
    case "WARD": {
      const w = f.ward ?? (/^\d{1,3}$/.test(bare(text)) ? String(Number(bare(text))) : null);
      if (!w) unclear = GUIDE_ASK_WARD;
      next = { ...g, ward: w };
      break;
    }
    case "PICK": {
      const opts = g.options ?? [];
      const k = readPick(text, opts.length);
      if (k === "none") {
        return { state: null, replies: [`ठीक है, अंदाज़े से गाइडलाइन नहीं बताई जा रही। ${GUIDE_PDF_HINT}`], outcome: "not-found" };
      }
      if (k == null) {
        const shown = opts.map((sno) => data.find((e) => e.sno === sno)!).filter(Boolean);
        return { state: g, replies: [`कृपया सूची में से नंबर लिखें।\n${pickText(shown)}`] };
      }
      next = { ...g, sno: opts[k]! };
      break;
    }
    case "TYPE": {
      const t = readType(text);
      if (!t) unclear = GUIDE_ASK_TYPE;
      next = { ...g, type: t };
      break;
    }
    case "AREA": {
      if (!f.area) unclear = /^\d+(\.\d+)?$/.test(bare(text)) ? "इकाई भी लिखें — वर्गफुट या वर्गमीटर (जैसे: 2770 वर्गफुट)।" : GUIDE_ASK_AREA;
      next = { ...g, area: f.area };
      break;
    }
    case "CORNER": {
      const c = readCorner(text);
      if (c == null) unclear = GUIDE_ASK_CORNER;
      next = { ...g, corner: c };
      break;
    }
  }
  if (unclear) return { state: g, replies: [g.step === "AREA" || g.step === "NAME" ? unclear : `समझ नहीं आया। ${unclear}`] };
  // Anything else the answer also says (e.g. the area together with the type).
  return guideNext(mergeFacts(next, f), fees, data);
}
