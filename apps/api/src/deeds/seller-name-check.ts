/**
 * Does the name on a seller's ID match the owner named in the land record?
 *
 * For farmland the deed must name the seller as the khasra does, so a
 * difference between the ID and the khasra is worth a warning before the deed
 * goes anywhere. Pure functions, no I/O, so the rules can be tested directly.
 */

export type NameMatch =
  /** The same name once honorifics, spacing and spelling noise are removed. */
  | "same"
  /** One is the other plus more -- usually a surname the khasra leaves out. */
  | "partial"
  | "different"
  /** Written in different scripts, so no honest comparison is possible. */
  | "incomparable";

export interface NameWarning {
  level: "error" | "notice";
  /** Hindi, ready to show. */
  message: string;
}

/**
 * Titles before a name. They must be followed by a space -- by the time this
 * runs, canonical() has turned "स्व." into "स्व " -- or "श्री" would be cut off
 * the front of "श्रीकृष्ण".
 */
const HONORIFIC = /^(श्रीमती|श्रीमति|श्री|सुश्री|कुमारी|कु|स्व|स्वर्गीय|मैसर्स|मेसर्स|m\/s|shri|smt|mr|mrs|ms)\s+/i;

/**
 * Where a relation starts: " पुत्र श्री ...". `\b` cannot be used here -- it only
 * knows ASCII word characters, so it never matches after a Hindi word.
 */
const RELATION_TAIL = /\s(पुत्र|पुत्री|पत्नी|पति|s\/o|d\/o|w\/o|c\/o)(?=\s|$)/i;

/**
 * Spelling noise that does not make a different person: zero-width joiners,
 * nukta, chandrabindu written as anusvara, halant-joined vs spaced "सिंह".
 */
function canonical(s: string): string {
  return s
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\u093c/g, "") // nukta
    .replace(/\u0901/g, "\u0902") // chandrabindu -> anusvara
    .replace(/[.,()]/g, " ")
    // A nasal consonant written half before another consonant is the same
    // sound as an anusvara: "कम्पनी" and "कंपनी" are one word.
    .replace(/[ङञणनम]\u094d(?=[\u0915-\u0939])/g, "\u0902")
    // "प्रा. लि." and "प्राइवेट लिमिटेड" are one suffix.
    .replace(/प्राइवेट\s*लिमिटेड|प्रा\s+लि(?=\s|$)/g, "प्रालि")
    .replace(/private\s+limited|pvt\s+ltd(?=\s|$)/gi, "pvtltd")
    .toLowerCase()
    .trim();
}

/** Just the person's own name: no honorific, no "पुत्र/पत्नी श्री ..." tail. */
export function bareName(raw: string): string {
  let s = canonical(raw);
  s = s.split(RELATION_TAIL)[0] ?? s;
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(HONORIFIC, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

function scriptOf(s: string): "deva" | "latin" | "mixed" | "none" {
  const deva = /[\u0900-\u097f]/.test(s);
  const latin = /[a-z]/i.test(s);
  if (deva && latin) return "mixed";
  if (deva) return "deva";
  if (latin) return "latin";
  return "none";
}

/** Edit distance, for a one-letter slip in a long name. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(tmp + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/**
 * Close enough to be the same word: exact, or one slip in a word of eight or
 * more characters ("निहालसिंह" / "निहालसींह"). Short words get no slack at all:
 * "शर्मा" and "वर्मा" are one letter apart and two different families.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  return longest >= 8 && distance(a, b) <= Math.floor(longest / 8);
}

export function compareNames(a: string, b: string): NameMatch {
  const x = bareName(a);
  const y = bareName(b);
  if (!x || !y) return "incomparable";
  const sx = scriptOf(x);
  const sy = scriptOf(y);
  if (sx !== sy || sx === "mixed") return "incomparable";

  // "ओतार सिंह" and "ओतारसिंह" are the same name written two ways. Exact only:
  // allowing a slip across the whole joined name would let one differing
  // letter in a short surname pass.
  const jx = x.replace(/\s/g, "");
  const jy = y.replace(/\s/g, "");
  if (jx === jy) return "same";

  // Same number of words, each the same word (slips allowed per word only).
  const wx = x.split(" ");
  const wy = y.split(" ");
  if (wx.length === wy.length && wx.every((w, i) => sameWord(w, wy[i] ?? ""))) return "same";

  // Every word of the shorter name is in the longer one: a surname or a
  // middle name the other document leaves out.
  const [short, long] = wx.length <= wy.length ? [x, y] : [y, x];
  const longWords = long.split(" ");
  const longJoined = long.replace(/\s/g, "");
  const covered = short
    .split(" ")
    // A two-letter fragment is inside half the names in the district; only a
    // real word may match by containment.
    .every((w) => longWords.some((lw) => sameWord(w, lw)) || (w.length >= 3 && longJoined.includes(w)));
  return covered ? "partial" : "different";
}

/**
 * The warnings for one farmland deed.
 *
 * `sellerNames` come from the seller-ID slot, `ownerNames` from the land
 * record, `deedText` is the deed as written. With seller IDs, each ID must
 * match an owner. Without them, the deed's existing seller must still name
 * every owner the khasra lists -- a copied deed for a different field would
 * otherwise carry the wrong seller silently.
 */
export function checkSellerNames(input: {
  sellerNames: string[];
  ownerNames: string[];
  deedText: string;
}): NameWarning[] {
  const owners = input.ownerNames.filter((n) => bareName(n));
  if (owners.length === 0) return [];
  const ownerList = owners.map(bareName).join(", ");
  const out: NameWarning[] = [];

  if (input.sellerNames.length > 0) {
    for (const seller of input.sellerNames) {
      const results = owners.map((o) => compareNames(seller, o));
      if (results.includes("same")) continue;
      if (results.includes("partial")) {
        out.push({
          level: "notice",
          message: `ID पर नाम "${bareName(seller)}" खसरे के भूमिस्वामी से पूरा मेल नहीं खाता (खसरे में: ${ownerList})। विलेख में खसरे वाला नाम लिखा जाएगा — एक बार जाँच लें।`,
        });
      } else if (results.every((r) => r === "incomparable")) {
        out.push({
          level: "notice",
          message: `ID पर नाम "${bareName(seller)}" की खसरे से तुलना नहीं हो सकी — शायद नाम अलग लिपि में है (खसरे में: ${ownerList})।`,
        });
      } else {
        out.push({
          level: "error",
          message: `ID पर नाम "${bareName(seller)}" खसरे के किसी भूमिस्वामी से मेल नहीं खाता (खसरे में: ${ownerList})। क्या सही व्यक्ति की ID डाली है?`,
        });
      }
    }
    return out;
  }

  const text = canonical(input.deedText).replace(/\s/g, "");
  for (const owner of owners) {
    const name = bareName(owner).replace(/\s/g, "");
    if (name && !text.includes(name)) {
      out.push({
        level: "error",
        message: `खसरे के भूमिस्वामी "${bareName(owner)}" का नाम विलेख में नहीं मिला। विक्रेता सही है या नहीं, जाँच लें।`,
      });
    }
  }
  return out;
}
