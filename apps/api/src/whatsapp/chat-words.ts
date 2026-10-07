/**
 * Words every WhatsApp conversation answers the same way -- customer, owner
 * and staff (chat-words.spec.ts): "cancel" closes what is open, "ok / thanks"
 * gets a short acknowledgement (never the whole menu again), office hours /
 * address get the office's details. Pure.
 */
import type { AttendanceSettings } from "@sampada/shared";
import { normDigits } from "./intake-rules.js";

const clean = (t: string) => normDigits(t).trim().toLowerCase().replace(/\s+/g, " ");

const CLOSE_RE =
  /^(cancel|cancle|cansel|कैंसल|कैन्सल|रद्द|रद|बंद|band|stop|स्टॉप|exit|quit|बस|bas|रहने दो|rehne do|rahne do|छोड़ो|छोडो|chhodo|chodo|नहीं चाहिए|nahi chahiye|nhi chahiye)(\s*(करो|कर दो|करें|karo|kar do|kardo|kr do|करिए|kariye|है|hai))?[\s!.।]*$/i;
/** "cancel", "रद्द करो", "बंद कर दो", "nahi chahiye": close whatever is open. */
export const isClose = (text: string): boolean => CLOSE_RE.test(clean(text));

const THANKS_RE =
  /^(ok|okay|okk+|ओके|ओक|thanks|thank you|thanku|thank u|thx|ty|धन्यवाद|शुक्रिया|shukriya|dhanyawad|dhanyavad|bye|बाय|theek hai|thik hai|thik h|ठीक है|accha|achha|acha|अच्छा|ji|जी|जी हाँ|done|great|nice|👍|🙏|👌)[\s!.।🙏👍👌]*$/iu;
/** "ok", "thanks", "धन्यवाद", "👍": acknowledged, not answered with a menu. */
export const isThanks = (text: string): boolean => {
  const s = clean(text);
  return THANKS_RE.test(s) || /^[\s🙏👍👌✅😊🙂❤️]+$/u.test(s);
};

const OFFICE_WORD = /ऑफिस|ऑफ़िस|office|ofc|दफ्तर|daftar|केंद्र|kendra|दुकान|dukan/i;
const WHEN_WORD = /कब|kab|समय|time|timing|टाइम|खुल|khul|बंद होता|band hota|kitne baje|कितने बजे|open|close|रविवार|sunday|छुट्टी|chhutti/i;
const WHERE_WORD = /पता|address|एड्रेस|location|लोकेशन|lokesan|कहाँ|कहां|kahan|kaha\b|kidhar|किधर|map|मैप|direction|रास्ता|rasta/i;

/** "ऑफिस कब खुलता है", "address bhejo", "आपका ऑफिस कहाँ है": office hours / address. */
export function isOfficeInfo(text: string): boolean {
  const s = clean(text);
  if (WHERE_WORD.test(s) && (OFFICE_WORD.test(s) || /^(address|पता|location|लोकेशन)/i.test(s) || /(bhejo|भेजो|batao|बताओ|\bdo\b|दो)/i.test(s))) return true;
  if (OFFICE_WORD.test(s) && WHEN_WORD.test(s)) return true;
  // "kitne baje aau", "kya sunday ko khula hai", "kal khula rahega": the office is meant.
  return (
    /(कितने बजे|kitne baje|kab|कब)\s*(आऊ|आऊँ|आऊं|आएँ|आएं|आयें|आ जाऊ|aau|aaun|aaoon|aayen|aaye|aa jau|aa sakt|आ सकत|milenge|मिलेंगे)/i.test(s) ||
    /(खुला|खुली|खुलता|खुलेगा|khula|khuli|khulta|khulega|बंद रहता|band rehta|band rahta|बंद रहेगा|band rahega)/i.test(s)
  );
}

const DAY_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const part = h < 12 ? "सुबह" : h < 16 ? "दोपहर" : "शाम";
  return `${part} ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};

/** The office's address (from the owner); OFFICE_ADDRESS overrides it. */
export const OFFICE_ADDRESS = "G-11, 12, मिलेनियम प्लाज़ा, गोविंदपुरी, सिटी सेंटर, ग्वालियर (म.प्र.)";
const OFFICE_ADDRESS_EN = "G-11, 12 Millenium Plaza, Govindpuri, City Centre, Gwalior, M.P.";

/** Office hours from the attendance settings, phone, address and a map link (OFFICE_MAP_URL, else a Google Maps search). */
export function officeInfoText(s: Pick<AttendanceSettings, "startTime" | "endTime" | "weeklyOff">, phone: string | null, env = process.env): string {
  const off = s.weeklyOff.length ? ` (${s.weeklyOff.map((d) => DAY_HI[d]).join(", ")} बंद)` : "";
  const custom = env.OFFICE_ADDRESS?.trim();
  const map = env.OFFICE_MAP_URL?.trim() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(custom || OFFICE_ADDRESS_EN)}`;
  const lines = ["🏢 नागरिक सेवा केंद्र", `समय: ${time12(s.startTime)} से ${time12(s.endTime)} तक${off}`];
  lines.push(`पता: ${custom || `${OFFICE_ADDRESS}\n(${OFFICE_ADDRESS_EN})`}`);
  lines.push(`नक्शा: ${map}`);
  if (phone) lines.push(`फ़ोन: ${phone}`);
  return lines.join("\n");
}

export const CLOSED_TEXT = 'ठीक है, बंद कर दिया। 🙏 कुछ और चाहिए तो "मेनू" लिखें।';
export const THANKS_TEXT = '🙏 धन्यवाद! कुछ और चाहिए तो "मेनू" लिखें।';
/** Sent once instead of the whole menu again (the menu was just sent). */
export const MENU_NUDGE = "कृपया ऊपर के मेनू में से नंबर लिखें — 1 ड्राफ्ट, 2 खर्च / गाइडलाइन, 3 मेरा काम, 4 स्टाफ से बात।";

/** The owner's alerts show the whole number ("+91 78984 75646") so it can be called or saved; logs keep it masked. */
export const fullPhone = (p: string): string => (/^91\d{10}$/.test(p) ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`);
