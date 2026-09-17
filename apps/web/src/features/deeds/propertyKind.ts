/**
 * What a deed is selling: farmland, a plot, a house, a flat or a shop.
 *
 * Read from the deed's own words rather than asked of a model. These deeds
 * name the property in a small, fixed vocabulary ("कृषि भूमि", "फ्लैट",
 * "दुकान"...), so counting those words is instant, free, and gives the same
 * answer every time -- and it is only a default the drafter can change.
 */
export type PropertyKind = "agriculture" | "plot" | "house" | "flat" | "shop";

export const PROPERTY_KINDS: PropertyKind[] = ["agriculture", "plot", "house", "flat", "shop"];

export const PROPERTY_KIND_LABEL: Record<PropertyKind, { en: string; hi: string }> = {
  agriculture: { en: "Agricultural land", hi: "कृषि भूमि" },
  plot: { en: "Plot", hi: "प्लॉट / भूखण्ड" },
  house: { en: "House", hi: "मकान" },
  flat: { en: "Flat", hi: "फ्लैट" },
  shop: { en: "Shop", hi: "दुकान" },
};

/**
 * Words that point at each kind. Matched after zero-width joiners are removed,
 * because these deeds are full of them ("प्‍लाट") and a pattern written without
 * one would silently miss half the corpus.
 */
const SIGNALS: Record<PropertyKind, RegExp> = {
  agriculture: /कृषि\s*भूमि|कृषि\s*योग्य|सिंचित|असिंचित|agricultur/gi,
  plot: /प्लाट|प्लॉट|भूखण्ड|भूखंड|\bplot\b/gi,
  // House deeds mostly say भवन (building) and निर्मित (built), not मकान.
  house: /मकान|भवन|निर्मित|\bhouse\b|duplex|ड्युप्लेक्स|डुप्लेक्स/gi,
  flat: /फ्लैट|फलैट|फ्लेट|\bflat\b|apartment|अपार्टमेंट/gi,
  shop: /दुकान|दूकान|\bshop\b|व्यावसायिक\s*प्रकोष्ठ|शोरूम|showroom/gi,
};

/**
 * A title word is a statement of intent ("फ्लैट ... श्री X"); a body word may
 * be incidental -- a flat's deed still says "भूखण्ड" for the land beneath it,
 * and nearly every deed quotes the land revenue code. So the title counts for
 * far more than any one mention in the text.
 */
const TITLE_WEIGHT = 25;

/**
 * "भवन" is in every flat deed too -- the building the flat sits in -- while
 * "फ्लैट" appears only in flat deeds, so it counts double. Weighting shops the
 * same way backfired: plot deeds name neighbouring shops in their boundaries.
 * Tuned against 452 title-labelled sale deeds from the live data: 98.2% right
 * from the body text alone.
 */
const KIND_WEIGHT: Record<PropertyKind, number> = {
  agriculture: 1,
  plot: 1,
  house: 1,
  flat: 2,
  shop: 1,
};

/**
 * Specific beats general on an exact tie: a flat or shop is also a building on
 * a plot, so those words win over "house" and "plot".
 */
const TIE_ORDER: PropertyKind[] = ["flat", "shop", "house", "agriculture", "plot"];

function clean(s: string): string {
  return s.replace(/[\u200b-\u200d\ufeff]/g, "");
}

function count(re: RegExp, s: string): number {
  re.lastIndex = 0;
  return (s.match(re) ?? []).length;
}

/** Best guess, or null when the deed does not say. */
export function detectPropertyKind(title: string, content: string): PropertyKind | null {
  const t = clean(title);
  const c = clean(content);
  let best: PropertyKind | null = null;
  let bestScore = 0;
  for (const kind of TIE_ORDER) {
    const score = (count(SIGNALS[kind], t) * TITLE_WEIGHT + count(SIGNALS[kind], c)) * KIND_WEIGHT[kind];
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The paperwork usually gathered for each kind in MP registries. A reminder
 * list, not a legal rule: offices differ, and the drafter knows their own.
 * An item shows as in hand when its slot has a document (`role`), or when a
 * property document yielded one of the labels in `found`.
 */
export interface ChecklistItem {
  en: string;
  hi: string;
  role?: "seller" | "buyer";
  found?: string[];
}

const COMMON: ChecklistItem[] = [
  { en: "Seller's ID (Aadhaar / PAN)", hi: "विक्रेता की ID (आधार / पैन)", role: "seller" },
  { en: "Buyer's ID (Aadhaar / PAN)", hi: "क्रेता की ID (आधार / पैन)", role: "buyer" },
];

export const CHECKLIST: Record<PropertyKind, ChecklistItem[]> = {
  agriculture: [
    ...COMMON,
    { en: "Khasra / B-1", hi: "खसरा / बी-1", found: ["खसरा नं."] },
    { en: "Bhu-adhikar rin pustika", hi: "भू-अधिकार ऋण पुस्तिका", found: ["CLR No."] },
    { en: "Map trace (naksha)", hi: "नक्शा ट्रेस" },
    { en: "Previous registry", hi: "पिछली रजिस्ट्री" },
  ],
  plot: [
    ...COMMON,
    { en: "Previous registry / chain", hi: "पिछली रजिस्ट्री / चेन" },
    { en: "Diversion order", hi: "डायवर्सन आदेश" },
    { en: "Colony permission / T&CP layout", hi: "कॉलोनी अनुमति / T&CP नक्शा" },
    { en: "Khasra", hi: "खसरा", found: ["खसरा नं."] },
    { en: "Site plan", hi: "साइट प्लान / नक्शा" },
  ],
  house: [
    ...COMMON,
    { en: "Previous registry", hi: "पिछली रजिस्ट्री" },
    { en: "Property tax receipt", hi: "संपत्ति कर रसीद" },
    { en: "Building permission / map", hi: "भवन अनुमति / नक्शा" },
    { en: "Electricity bill", hi: "बिजली बिल" },
  ],
  flat: [
    ...COMMON,
    { en: "Previous registry / builder agreement", hi: "पिछली रजिस्ट्री / बिल्डर अनुबंध" },
    { en: "Builder / society NOC", hi: "बिल्डर / सोसाइटी NOC" },
    { en: "Property tax receipt", hi: "संपत्ति कर रसीद" },
    { en: "RERA registration", hi: "RERA पंजीयन" },
  ],
  shop: [
    ...COMMON,
    { en: "Previous registry", hi: "पिछली रजिस्ट्री" },
    { en: "Property tax receipt", hi: "संपत्ति कर रसीद" },
    { en: "Commercial diversion", hi: "व्यावसायिक डायवर्सन" },
    { en: "Building permission / map", hi: "भवन अनुमति / नक्शा" },
  ],
};
