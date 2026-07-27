/**
 * hindi-numerals.ts
 * Indian-system number <-> Hindi words. No dependencies.
 *
 * numberToHindiWords(4920000) -> "उनचास लाख बीस हजार"
 * hindiWordsToNumber("उनचास लाख बीस हजार") -> 4920000
 */

/* ------------------------------------------------------------------ */
/* 0-99 canonical spellings                                            */
/* ------------------------------------------------------------------ */

const ONES: string[] = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'छह', 'सात', 'आठ', 'नौ',
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरेपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

/** Alternate spellings seen in real deeds. Normalisation catches many more. */
const VARIANTS: Record<string, number> = {
  'पाँच': 5, 'पाच': 5, 'पांच': 5,
  'छः': 6, 'छ:': 6, 'छे': 6, 'छ': 6,
  'नो': 9,
  'पन्द्रह': 15, 'पंदरह': 15,
  'सतरह': 17,
  'अट्ठारह': 18,
  'उनीस': 19,
  'इकीस': 21,
  'बाइस': 22, 'तेइस': 23,
  'पचीस': 25,
  'सत्ताइस': 27, 'अट्ठाइस': 28, 'अठाईस': 28,
  'उन्तीस': 29, 'उनत्तीस': 29,
  'इक्तीस': 31, 'इकत्तीस': 31,
  'तेतीस': 33, 'तैतीस': 33,
  'चौतीस': 34, 'चोंतीस': 34,
  'पैतीस': 35, 'पेंतीस': 35,
  'सैतीस': 37,
  'अरतीस': 38,
  'उन्तालीस': 39, 'उनचालीस': 39,
  'इक्तालीस': 41,
  'बियालीस': 42,
  'तैतालीस': 43, 'तेतालीस': 43,
  'चौवालीस': 44, 'चुवालीस': 44,
  'पैतालीस': 45,
  'छयालीस': 46,
  'सैतालीस': 47,
  'अठतालीस': 48,
  'उन्चास': 49, 'उनंचास': 49, 'उनचास': 49,
  'इकयावन': 51,
  'तिरपन': 53, 'त्रेपन': 53,
  'चवन': 54, 'चोवन': 54,
  'उन्सठ': 59,
  'इक्सठ': 61,
  'तिरेसठ': 63, 'त्रेसठ': 63,
  'चौसठ': 64,
  'पैसठ': 65,
  'छयासठ': 66,
  'उन्हत्तर': 69,
  'छियत्तर': 76,
  'सत्तहत्तर': 77,
  'अट्ठहत्तर': 78,
  'उन्यासी': 79, 'उन्नासी': 79,
  'इकयासी': 81,
  'बियासी': 82,
  'त्रासी': 83,
  'अठासी': 88, 'अठावन': 58,
  'नवयासी': 89,
  'इक्यानबे': 91, 'इकयानवे': 91,
  'बानबे': 92,
  'तिरानबे': 93,
  'चौरानबे': 94,
  'पचानबे': 95,
  'छियानबे': 96, 'छयानवे': 96,
  'सत्तानबे': 97, 'सतानवे': 97,
  'अट्ठानबे': 98, 'अठानवे': 98,
  'निन्यानबे': 99, 'निनानवे': 99,
};

/* ------------------------------------------------------------------ */
/* Scale words                                                         */
/* ------------------------------------------------------------------ */

const SCALES: Record<string, number> = {
  'सौ': 100,
  'सैकड़ा': 100,
  'हजार': 1_000,
  'हज़ार': 1_000,
  'सहस्र': 1_000,
  'लाख': 100_000,
  'लक्ष': 100_000,
  'करोड़': 10_000_000,
  'करोड': 10_000_000,
  'क्रोड़': 10_000_000,
  'अरब': 1_000_000_000,
  'खरब': 100_000_000_000,
};

/** Words that may appear inside an amount phrase and should be ignored. */
const FILLER = new Set(['रुपये', 'रूपये', 'रुपए', 'रूपए', 'रुपया', 'रूपया', 'मात्र', 'केवल', 'और', 'व']);

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const NUKTA_MAP: Record<string, string> = {
  '\u0958': 'क', '\u0959': 'ख', '\u095A': 'ग', '\u095B': 'ज',
  '\u095C': 'ड', '\u095D': 'ढ', '\u095E': 'फ', '\u095F': 'य',
};

/**
 * Collapses the spelling differences that don't change meaning, so that
 * "पाँच" / "पांच" / "पाच" all land on the same key.
 */
export function normalizeHindi(input: string): string {
  let s = input.normalize('NFC');
  s = s.replace(/[\u200C\u200D]/g, '');                 // ZWJ / ZWNJ
  s = s.replace(/[\u0958-\u095F]/g, (c) => NUKTA_MAP[c] ?? c);
  s = s.replace(/\u093C/g, '');                          // combining nukta
  s = s.replace(/[\u0901\u0902]/g, '');                  // chandrabindu, anusvara
  s = s.replace(/\u094C/g, '\u094B');                    // ौ -> ो
  s = s.replace(/\u0948/g, '\u0947');                    // ै -> े
  s = s.replace(/(.)\u094D\1/g, '$1');                   // क्क -> क, त्त -> त
  return s.trim();
}

/** number -> word lookup, keyed by normalised form. */
const WORD_TO_NUM = new Map<string, number>();
ONES.forEach((w, i) => WORD_TO_NUM.set(normalizeHindi(w), i));
Object.entries(VARIANTS).forEach(([w, n]) => WORD_TO_NUM.set(normalizeHindi(w), n));

const SCALE_LOOKUP = new Map<string, number>();
Object.entries(SCALES).forEach(([w, v]) => SCALE_LOOKUP.set(normalizeHindi(w), v));

const FILLER_LOOKUP = new Set([...FILLER].map(normalizeHindi));

/* ------------------------------------------------------------------ */
/* number -> words                                                     */
/* ------------------------------------------------------------------ */

/** Safe index into ONES — the table covers 0-99, anything else is a bug. */
function ones(i: number): string {
  return ONES[i] ?? '';
}

export function numberToHindiWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return 'ऋण ' + numberToHindiWords(-n);
  n = Math.round(n);
  if (n === 0) return ones(0);

  const out: string[] = [];

  const crore = Math.floor(n / 10_000_000);
  if (crore > 0) {
    out.push(crore > 99 ? numberToHindiWords(crore) : ones(crore), 'करोड़');
    n %= 10_000_000;
  }
  const lakh = Math.floor(n / 100_000);
  if (lakh > 0) { out.push(ones(lakh), 'लाख'); n %= 100_000; }

  const thousand = Math.floor(n / 1_000);
  if (thousand > 0) { out.push(ones(thousand), 'हजार'); n %= 1_000; }

  const hundred = Math.floor(n / 100);
  if (hundred > 0) { out.push(ones(hundred), 'सौ'); n %= 100; }

  if (n > 0) out.push(ones(n));

  return out.join(' ');
}

/** "उनचास लाख बीस हजार रूपये मात्र" — with the currency tail deeds usually carry. */
export function numberToHindiRupees(n: number): string {
  return `${numberToHindiWords(n)} रूपये`;
}

/* ------------------------------------------------------------------ */
/* words -> number                                                     */
/* ------------------------------------------------------------------ */

export interface ParseResult {
  value: number | null;
  /** Tokens that were not recognised as digits, scales or filler. */
  unknownTokens: string[];
}

export function parseHindiWords(phrase: string): ParseResult {
  const tokens = normalizeHindi(phrase)
    .replace(/[।,.\-–—/()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  let sawAnyNumber = false;
  const unknownTokens: string[] = [];

  for (const raw of tokens) {
    const t = raw.trim();
    if (!t || FILLER_LOOKUP.has(t)) continue;

    if (WORD_TO_NUM.has(t)) {
      current += WORD_TO_NUM.get(t)!;
      sawAnyNumber = true;
      continue;
    }

    if (SCALE_LOOKUP.has(t)) {
      const scale = SCALE_LOOKUP.get(t)!;
      sawAnyNumber = true;
      if (scale === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        total += (current === 0 ? 1 : current) * scale;
        current = 0;
      }
      continue;
    }

    unknownTokens.push(raw);
  }

  total += current;

  if (!sawAnyNumber) return { value: null, unknownTokens };
  return { value: total, unknownTokens };
}

/* ------------------------------------------------------------------ */
/* Digit helpers                                                       */
/* ------------------------------------------------------------------ */

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** "४९,२०,०००" or "49,20,000" -> 4920000 */
export function parseIndianFigure(raw: string): number | null {
  const ascii = raw.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  const cleaned = ascii.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 4920000 -> "49,20,000" (Indian grouping) */
export function formatIndianFigure(n: number): string {
  const [rawInt, decPart] = String(n).split('.');
  const intPart = rawInt ?? '0';
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
    : last3;
  return decPart ? `${grouped}.${decPart}` : grouped;
}
