/**
 * verify-amounts.ts
 * Finds "figure + words" amount pairs inside Hindi deed text and checks
 * whether the two agree.
 *
 * Typical deed line:
 *   कुल राशि रूपये 49,20,000/- शब्देन उनचास लाख बीस हजार रूपये में विक्रय ...
 */

import {
  numberToHindiWords,
  parseHindiWords,
  parseIndianFigure,
  formatIndianFigure,
} from './hindi-numerals.js';

export type AmountIssueLevel = 'error' | 'warning' | 'info';

export interface AmountFinding {
  level: AmountIssueLevel;
  code: 'mismatch' | 'unreadable_words' | 'words_missing' | 'ok';
  /** Character offset in the source text — use it to highlight the editor. */
  start: number;
  end: number;
  /** The raw matched slice, for display. */
  excerpt: string;
  figure: number | null;
  figureText: string;
  wordsText: string | null;
  /** Number the written words actually add up to. */
  wordsValue: number | null;
  /** What the words should have said, given the figure. */
  expectedWords: string | null;
  message: string;
}

/** Markers that introduce the written form. */
const WORD_MARKERS = ['शब्देन', 'शब्दें', 'शब्देत', 'अक्षरे', 'अक्षरों में', 'शब्दों में'];

const MARKER_RE = WORD_MARKERS.map((m) => m.replace(/\s+/g, '\\s+')).join('|');
const CURRENCY = '(?:₹|रुपये|रूपये|रुपए|रूपए|रु\\.?|Rs\\.?)';
const FIGURE = '([0-9०-९][0-9०-९,\\s]{0,20}[0-9०-९]|[0-9०-९])';

/**
 * Punctuation that legitimately sits between the figure and the written form:
 * the /- suffix, quotes around the शब्देन clause, brackets, dashes.
 */
const GAP = `[\\s"'\\u2018\\u2019\\u201C\\u201D()\\[\\]{}:;,\\-\\u2013\\u2014/]*`;

/** figure … marker … words … terminator */
const PAIR_RE = new RegExp(
  `${CURRENCY}?\\s*${FIGURE}${GAP}${CURRENCY}?${GAP}(?:${MARKER_RE})${GAP}([^0-9०-९।\\n]{2,120}?)\\s*(?:${CURRENCY}|मात्र|केवल|only|$)`,
  'g',
);

/** Any figure that looks like money, used to spot amounts with no words at all. */
const LONE_FIGURE_RE = new RegExp(
  `${CURRENCY}\\s*${FIGURE}\\s*(?:\\/\\s*-|\\/-)?|${FIGURE}\\s*\\/-`,
  'g',
);

/** Below this we assume it's a plot number, ward number, year — not money. */
const MIN_MONEY = 1000;

export interface VerifyOptions {
  /** Amounts under this are ignored by the "words missing" check. Default 1000. */
  minMoney?: number;
  /**
   * Also report amounts written only in figures. Off by default: deeds carry
   * plenty of figures that are not meant to have a शब्देन clause.
   */
  flagMissingWords?: boolean;
}

export function verifyAmounts(text: string, opts: VerifyOptions = {}): AmountFinding[] {
  const minMoney = opts.minMoney ?? MIN_MONEY;
  const flagMissingWords = opts.flagMissingWords ?? false;

  const findings: AmountFinding[] = [];
  const coveredRanges: Array<[number, number]> = [];

  PAIR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = PAIR_RE.exec(text)) !== null) {
    const full = m[0];
    const figureText = m[1] ?? '';
    const wordsText = m[2] ?? '';
    const start = m.index;
    const end = m.index + full.length;
    coveredRanges.push([start, end]);

    const figure = parseIndianFigure(figureText);
    const parsed = parseHindiWords(wordsText);
    const excerpt = full.trim().replace(/\s+/g, ' ');

    if (figure === null) continue;

    if (parsed.value === null) {
      findings.push({
        level: 'warning',
        code: 'unreadable_words',
        start, end, excerpt,
        figure,
        figureText: figureText.trim(),
        wordsText: wordsText.trim(),
        wordsValue: null,
        expectedWords: numberToHindiWords(figure),
        message:
          `शब्दों को पढ़ा नहीं जा सका — हाथ से मिलान करें। ` +
          `अंक ${formatIndianFigure(figure)} के लिए अपेक्षित: “${numberToHindiWords(figure)}”`,
      });
      continue;
    }

    if (parsed.value !== figure) {
      // Unrecognised tokens mean we cannot trust our own arithmetic, so we
      // report what we couldn't read rather than a misleading total.
      if (parsed.unknownTokens.length > 0) {
        findings.push({
          level: 'error',
          code: 'unreadable_words',
          start, end, excerpt,
          figure,
          figureText: figureText.trim(),
          wordsText: wordsText.trim(),
          wordsValue: null,
          expectedWords: numberToHindiWords(figure),
          message:
            `“${parsed.unknownTokens.join('”, “')}” पहचाना नहीं गया — वर्तनी जाँचें। ` +
            `अंक ${formatIndianFigure(figure)} के लिए सही शब्द: ` +
            `“${numberToHindiWords(figure)}”`,
        });
        continue;
      }

      findings.push({
        level: 'error',
        code: 'mismatch',
        start, end, excerpt,
        figure,
        figureText: figureText.trim(),
        wordsText: wordsText.trim(),
        wordsValue: parsed.value,
        expectedWords: numberToHindiWords(figure),
        message:
          `अंक ${formatIndianFigure(figure)} और शब्द “${wordsText.trim()}” ` +
          `(= ${formatIndianFigure(parsed.value)}) मेल नहीं खाते। ` +
          `सही शब्द: “${numberToHindiWords(figure)}”`,
      });
      continue;
    }

    findings.push({
      level: 'info',
      code: 'ok',
      start, end, excerpt,
      figure,
      figureText: figureText.trim(),
      wordsText: wordsText.trim(),
      wordsValue: parsed.value,
      expectedWords: null,
      message: `${formatIndianFigure(figure)} — अंक और शब्द मेल खाते हैं`,
    });
  }

  if (flagMissingWords) {
    LONE_FIGURE_RE.lastIndex = 0;
    let f: RegExpExecArray | null;
    while ((f = LONE_FIGURE_RE.exec(text)) !== null) {
      const start = f.index;
      const end = f.index + f[0].length;
      if (coveredRanges.some(([s, e]) => start >= s && start < e)) continue;

      const figure = parseIndianFigure(f[1] ?? f[2] ?? '');
      if (figure === null || figure < minMoney) continue;

      findings.push({
        level: 'warning',
        code: 'words_missing',
        start, end,
        excerpt: f[0].trim(),
        figure,
        figureText: (f[1] ?? f[2] ?? '').trim(),
        wordsText: null,
        wordsValue: null,
        expectedWords: numberToHindiWords(figure),
        message:
          `${formatIndianFigure(figure)} केवल अंकों में है, शब्देन नहीं लिखा। ` +
          `सुझाव: “शब्देन ${numberToHindiWords(figure)} रूपये”`,
      });
    }
  }

  return findings.sort((a, b) => a.start - b.start);
}

export interface AmountAuditSummary {
  errors: number;
  warnings: number;
  matched: number;
  findings: AmountFinding[];
  /** True when nothing needs the drafter's attention. */
  clean: boolean;
}

export function auditAmounts(text: string, opts?: VerifyOptions): AmountAuditSummary {
  const findings = verifyAmounts(text, opts);
  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warning').length;
  const matched = findings.filter((f) => f.code === 'ok').length;
  return { errors, warnings, matched, findings, clean: errors === 0 && warnings === 0 };
}
