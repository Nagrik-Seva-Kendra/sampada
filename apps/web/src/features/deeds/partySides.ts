/**
 * Is the seller (or the buyer) a person or an organisation?
 *
 * Read from the deed's own seller and buyer sections, the same way the
 * property kind is: a default the drafter can change, never a verdict.
 */
export type PartyType = "individual" | "organisation";
export type Side = "seller" | "buyer";

/**
 * Words that only an organisation's entry uses. "द्वारा पार्टनर" is how these
 * deeds introduce the people signing for a firm.
 */
const ORGANISATION_WORDS =
  /कंपनी|फर्म|प्रा\s*लि|प्राइवेट\s*लिमिटेड|लिमिटेड|बैंक|सोसाइटी|सोसायटी|ट्रस्ट|मैसर्स|मेसर्स|m\/s|द्वारा\s*(पार्टनर|भागीदार|डायरेक्टर|संचालक|प्रोप्राइटर|प्रबंधक|अधिकृत)|pvt|ltd|llp/i;

/**
 * A PAN's fourth letter says what holds it: P for a person; C company, F firm,
 * T trust, A/B association, G government, L local authority, J other. So a
 * PAN in the entry that is not a P is an organisation's.
 */
const ORGANISATION_PAN = /\b[A-Z]{3}[ABCFGHJLT][A-Z]\d{4}[A-Z]\b/;

/** An entry that opens with a person's title, after its heading and any "1.". */
const READS_AS_PERSON = /^\s*(विक्रेता|क्रेता)?(गण)?\s*(पक्ष)?\s*[-:–]?\s*(\d{1,2}\s*[.)]\s*)?(श्री|श्रीमती|श्रीमति|सुश्री|कुमारी|डॉ|डाॅ)/;

function clean(s: string): string {
  return s
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ङञणनम]\u094d(?=[\u0915-\u0939])/g, "\u0902")
    .replace(/\./g, " ");
}

/**
 * The seller's and buyer's entries: from "विक्रेता" to "क्रेता पक्ष", and from
 * there to the first "यह कि" that starts the body. Deeds vary; when a heading
 * is missing the section is empty and nothing is detected.
 */
export function partySections(content: string): Record<Side, string> {
  const text = clean(content);
  const sellerAt = text.search(/(^|\n)\s*विक्रेता/);
  const buyerAt = text.search(/(^|\n)\s*क्रेता\s*पक्ष/);
  if (sellerAt === -1 || buyerAt === -1 || buyerAt < sellerAt) return { seller: "", buyer: "" };
  const rest = text.slice(buyerAt);
  const bodyAt = rest.search(/\n\s*यह\s*कि/);
  return {
    seller: text.slice(sellerAt, buyerAt),
    buyer: bodyAt === -1 ? rest.slice(0, 600) : rest.slice(0, bodyAt),
  };
}

/**
 * The entry without its addresses. "नियर बैंक ऑफ इंडिया" and "हाउसिंग सोसाइटी"
 * are where a person lives, not what they are -- on live deeds, reading the
 * address made three of five weak matches wrong.
 */
function withoutAddresses(section: string): string {
  return section
    .split("\n")
    .map((line) => line.split(/निवासी|पता\s*[-:]|कार्यालय\s*[-:]|हाल\s*मुकाम/)[0] ?? "")
    .join(" ");
}

export function detectPartyTypes(content: string): Record<Side, PartyType> {
  const sections = partySections(content);
  // Words from the name part only; a PAN is never part of an address, so the
  // whole entry is fair for that.
  const kind = (s: string): PartyType => {
    if (!s) return "individual";
    const name = withoutAddresses(s);
    if (ORGANISATION_WORDS.test(name)) return "organisation";
    // A non-person PAN on an entry that reads as a person -- "श्री रोहित वाधवा
    // (पेन AAGHR5610B)" is an HUF PAN on a man's name -- stays a person.
    return ORGANISATION_PAN.test(s) && !READS_AS_PERSON.test(name) ? "organisation" : "individual";
  };
  return { seller: kind(sections.seller), buyer: kind(sections.buyer) };
}
