import { officeFeeFor, type WaOfficeFees } from "@sampada/shared";
import { underValueWarning } from "./under-value.js";
import { dayHi } from "./registry-date.js";

/**
 * Customer-satisfaction texts (pure): a simple summary of the request, the
 * full cost up front, the registry-day checklist, the "full packet" when the
 * work is done, the rating question, and the correction-deed policy.
 */

const inr = (n: number) => Math.round(n).toLocaleString("en-IN");
const DEED_HI: Record<string, string> = { sale: "विक्रय पत्र (रजिस्ट्री)", mortgage: "बंधक पत्र", other: "अन्य दस्तावेज़" };

export const DEFAULT_CORRECTION_POLICY =
  "रजिस्ट्री होने के बाद कोई गलती मिले तो उसका सुधार संशोधन विलेख (correction deed) से होता है। " +
  "गलती ऑफिस की ओर से हुई हो तो ऑफिस अपना शुल्क नहीं लेगा; स्टाम्प और पंजीयन शुल्क सरकारी नियम के अनुसार लगेंगे। " +
  "जानकारी ग्राहक की ओर से गलत दी गई हो तो पूरा शुल्क लगेगा।";

export const RATING_RE = /^\s*([1-5])\s*(⭐|स्टार|star)?\s*$/i;
export const CORRECTION_RE = /^(सुधार|गलती|ग़लती|correction|galti|sudhar|सुधारना है|गलत है)(\s|:|$)/i;
const DOC_WORD = "कागज़|कागज|कागजात|कागज़ात|kagaj|kagaz|kaagaz|kagzat|दस्तावेज़|दस्तावेज|dastavej|dastavez|documents?|docs?|papers?";
const DOC_ASK = "क्या|kya|कौन|kaun|चाहिए|chahiye|chahie|लगेंगे|लगेगा|लगते|lagenge|lagega|lagte|लाने|लाना|laane|lana|lane|list|लिस्ट|which|what|required|need|ज़रूरी|जरूरी|jaruri|zaruri";
/** "चेकलिस्ट", "kagaj kya kya lagenge", "रजिस्ट्री के लिए कौन से दस्तावेज़ चाहिए", or just "कागज". */
export const CHECKLIST_RE = new RegExp(
  `^(चेकलिस्ट|checklist|क्या लाना है|kya lana hai|क्या क्या लाना)|^(${DOC_WORD})[\\s?।.!]*$|(${DOC_WORD}).*(${DOC_ASK})|(${DOC_ASK}).*(${DOC_WORD})`,
  "i",
);

/** Plain-language summary sent right after submit. */
export function simpleSummary(ref: string, d: any): string {
  const lines = [`📝 आपके अनुरोध ${ref} का सरल सारांश:`, `• दस्तावेज़: ${DEED_HI[d.deedType ?? "sale"] ?? DEED_HI.sale}`];
  const party = d.deedType === "mortgage" ? d.mortgagorName : d.buyerName;
  if (party) lines.push(`• ${d.deedType === "mortgage" ? "बंधककर्ता" : "क्रेता"}: ${party}`);
  if (d.amount) lines.push(`• राशि: ₹${inr(d.amount)}`);
  if (d.regDate) lines.push(`• पसंद की रजिस्ट्री तारीख: ${dayHi(d.regDate)}`);
  lines.push("• आगे: स्टाफ ड्राफ्ट बनाकर आपको जाँच के लिए भेजेगा, फिर रजिस्ट्री की तारीख तय होगी।");
  return lines.join("\n");
}

/**
 * Full cost up front (estimate): stamp duty + registration fee + office fee
 * (+ geo-tag by staff per photo). Stamp / registration on the higher of the
 * amount and the guideline value; woman buyer 1% registration, else 3%.
 */
export function fullCostText(d: any, fees: WaOfficeFees, geoTagFee: number): string | null {
  if (d.deedType === "other") return null;
  const g = d.guideline as { marketValue?: number; stamp?: { sdPct?: number } } | undefined;
  const base = Math.max(d.amount ?? 0, g?.marketValue ?? 0);
  const office = officeFeeFor("registry", base || null, fees);
  if (!base) {
    return [
      "💰 खर्च: राशि/गाइडलाइन तय होते ही स्टाफ पूरा खर्च बताएगा।",
      office ? `ऑफिस शुल्क: ₹${inr(office)}` : null,
      d.geoTagMode === "STAFF" ? `जियो-टैग फ़ोटो (स्टाफ से): ₹${inr(geoTagFee)} प्रति फ़ोटो` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const sdPct = g?.stamp?.sdPct ?? null;
  const woman = d.buyerRelation === "पत्नी" || d.buyerRelation === "पुत्री";
  const regPct = d.deedType === "mortgage" ? null : woman ? 0.01 : 0.03;
  const lines = [`💰 पूरा खर्च (अनुमान), गणना ₹${inr(base)} पर:`];
  let total = 0;
  if (sdPct != null && d.deedType !== "mortgage") {
    const sd = Math.round(base * sdPct);
    total += sd;
    lines.push(`• स्टाम्प शुल्क (${(sdPct * 100).toFixed(1)}%): ₹${inr(sd)}`);
  } else lines.push("• स्टाम्प शुल्क: स्टाफ बताएगा (जगह के हिसाब से)");
  if (regPct != null) {
    const reg = Math.round(base * regPct);
    total += reg;
    lines.push(`• पंजीयन शुल्क (${woman ? "महिला क्रेता 1%" : "3%"}): ₹${inr(reg)}`);
  }
  if (office) {
    total += office;
    lines.push(`• ऑफिस शुल्क: ₹${inr(office)}`);
  }
  if (d.geoTagMode === "STAFF") lines.push(`• जियो-टैग फ़ोटो (स्टाफ से): ₹${inr(geoTagFee)} प्रति फ़ोटो (गिनती स्टाफ बताएगा)`);
  if (total) lines.push(`कुल लगभग: ₹${inr(total)}${d.geoTagMode === "STAFF" ? " + जियो-टैग" : ""}`);
  const warn = underValueWarning(d.amount, g?.marketValue);
  if (warn) lines.push(warn);
  lines.push("अंतिम राशि संपदा पोर्टल पर तय होगी; कोई छुपा शुल्क नहीं।");
  return lines.join("\n");
}

/** What to bring on the registry day. */
export function checklistText(d: any): string {
  const sale = d.deedType !== "mortgage";
  const lines = [
    "✅ रजिस्ट्री के दिन की चेकलिस्ट:",
    "• सभी पक्षकारों का मूल आधार कार्ड और PAN कार्ड",
    "• 2 गवाह — अपने मूल आधार कार्ड के साथ",
    sale ? "• संपत्ति की पुरानी रजिस्ट्री (मूल) और नामांतरण/खसरा की प्रति" : "• बैंक का सैंक्शन लेटर और संपत्ति की मूल रजिस्ट्री",
    "• सभी पक्षकारों की 2-2 पासपोर्ट साइज़ फ़ोटो",
    sale ? "• स्टाम्प/पंजीयन शुल्क के भुगतान की व्यवस्था (ऑनलाइन / चैक)" : "• बैंक अधिकारी (यदि बैंक कहे)",
    d.geoTagMode === "SELF" ? "• संपत्ति की जियो-टैग फ़ोटो (संपदा 2.0 ऐप से ली हुई)" : null,
    "• सभी पक्षकार समय पर स्वयं उपस्थित हों",
  ];
  return lines.filter(Boolean).join("\n");
}

/** The "full packet" when the work is DONE. */
export function packetText(ref: string, d: any, registryDate: string | null, policy: string): string {
  const lines = [
    `📦 अनुरोध ${ref} — काम पूरा, आपका पूरा पैकेट:`,
    `• दस्तावेज़: ${DEED_HI[d.deedType ?? "sale"] ?? DEED_HI.sale}`,
    registryDate ? `• रजिस्ट्री: ${dayHi(registryDate)}` : null,
    "• पंजीकृत दस्तावेज़ की मूल प्रति और सभी रसीदें संभाल कर रखें।",
    d.deedType !== "mortgage" ? "• अगला कदम: 30 दिन के अंदर नामांतरण (mutation) करवाएँ — मदद चाहिए तो यहाँ लिखें।" : "• लोन पूरा होने पर बंधक मुक्ति (री-कन्वेयन्स) ज़रूर करवाएँ।",
    `• गलती की नीति: ${policy}`,
    'कोई गलती दिखे तो "सुधार:" लिखकर बताएँ।',
  ];
  return lines.filter(Boolean).join("\n");
}

export const RATING_ASK = (ref: string) =>
  `🙏 अनुरोध ${ref} — नागरिक सेवा केंद्र की सेवा कैसी लगी?\n1 से 5 में जवाब दें (5 = बहुत अच्छी)।`;

export function ratingReply(n: number, reviewUrl: string | null): string {
  if (n >= 4) return `धन्यवाद! 🙏${reviewUrl ? `\nआपकी राय दूसरों की मदद करेगी — Google पर समीक्षा लिखें: ${reviewUrl}` : ""}`;
  return "धन्यवाद। हमें खेद है कि अनुभव अच्छा नहीं रहा। कृपया एक पंक्ति में बताएँ क्या कमी रही — मालिक स्वयं देखेंगे।";
}
