/**
 * ID-card photos the WhatsApp bot collects from every party, so the details
 * are read from the card instead of typed (no typing mistakes). Owner-editable
 * config lives here; the retention period is WA_ID_PHOTO_RETENTION_DAYS on the
 * API (default below).
 */

export type IdPhotoKind = "aadhaarFront" | "aadhaarBack" | "pan" | "passportPhoto";

/**
 * Photos asked from EVERY party, in this order (owner's rule, like
 * SAMPADA_REQUIRED_PARTY_FIELDS). passportPhoto: SAMPADA 2.0 needs the party's
 * photo. Remove a kind here to stop asking for it.
 */
export const SAMPADA_REQUIRED_PARTY_PHOTOS: readonly IdPhotoKind[] = ["aadhaarFront", "aadhaarBack", "pan", "passportPhoto"];

export const ID_PHOTO_LABEL: Record<IdPhotoKind, string> = {
  aadhaarFront: "आधार कार्ड (आगे)",
  aadhaarBack: "आधार कार्ड (पीछे)",
  pan: "PAN कार्ड",
  passportPhoto: "पासपोर्ट साइज़ फ़ोटो",
};

/** Days after a request is DONE/REJECTED before its ID photos are deleted. */
export const DEFAULT_ID_PHOTO_RETENTION_DAYS = 90;

/** Why a request got "स्टाफ जाँच" from the ID cards. */
export type IdWarningKind = "aadhaarPanName" | "panFather" | "unreadable";

export const ID_WARNING_TEXT: Record<IdWarningKind, string> = {
  aadhaarPanName: "आधार और PAN कार्ड पर नाम मेल नहीं खाता",
  panFather: "PAN कार्ड पर पिता का नाम ग्राहक के लिखे नाम से अलग है",
  unreadable: "कार्ड की फ़ोटो पढ़ी नहीं जा सकी — जानकारी ग्राहक ने लिखकर दी",
};

// ---------- name comparison across scripts ----------
// Aadhaar/PAN names are in English; the customer may type in Hindi. Compare a
// rough consonant "skeleton" of each word (vowels dropped, aspirates merged),
// so "राजेश कुमार शर्मा" ~ "RAJESH KUMAR SHARMA". A mismatch only flags the
// request for staff -- it never blocks the customer.

const DEVA: Record<string, string> = {
  क: "k", ख: "k", ग: "g", घ: "g", ङ: "n", च: "c", छ: "c", ज: "j", झ: "j", ञ: "n",
  ट: "t", ठ: "t", ड: "d", ढ: "d", ण: "n", त: "t", थ: "t", द: "d", ध: "d", न: "n",
  प: "p", फ: "p", ब: "b", भ: "b", म: "m", य: "y", र: "r", ल: "l", ळ: "l", व: "v",
  श: "s", ष: "s", स: "s", ह: "h", "ं": "n", "ँ": "n", ज़: "j", फ़: "p", ड़: "d", ढ़: "d",
};

function latinSkeleton(w: string): string {
  return w
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/z/g, "j")
    .replace(/w/g, "v")
    .replace(/f/g, "p")
    .replace(/ch/g, "c")
    .replace(/([kgcjtdpbs])h/g, "$1") // aspirates: kh, gh, th, dh, bh, sh ... → k, g, t, d, b, s
    .replace(/[aeiou]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function devaSkeleton(w: string): string {
  const nfc = w.normalize("NFC");
  let out = "";
  for (const ch of nfc) out += DEVA[ch] ?? (/[a-z]/i.test(ch) ? ch.toLowerCase() : "");
  // A final "य" after a vowel sign (प्रिया) is written "ya" and survives; keep as is.
  return out.replace(/(.)\1+/g, "$1");
}

const HONORIFICS = /^(shri|sri|smt|mr|mrs|ms|kumari|km|dr|late|sh|श्री|श्रीमती|सुश्री|कुमारी|स्व|डॉ)\.?$/i;

/** Word skeletons of a name (honorifics dropped). */
export function nameSkeleton(name: string): string[] {
  return name
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.test(w))
    .map((w) => (/[ऀ-ॿ]/.test(w) ? devaSkeleton(w) : latinSkeleton(w)))
    .filter(Boolean);
}

function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 3 || Math.abs(a.length - b.length) > 1) return false;
  // one edit apart
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Whether two names are the same person's name, allowing Hindi vs English
 * spelling, a missing middle name, or an initial ("R. K. Sharma"). Null when
 * either side is empty (nothing to compare).
 */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const x = nameSkeleton(a ?? "");
  const y = nameSkeleton(b ?? "");
  if (!x.length || !y.length) return null;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const used = new Set<number>();
  for (const w of short) {
    const k = long.findIndex((v, i) => !used.has(i) && (close(v, w) || (w.length === 1 && v[0] === w) || (v.length === 1 && w[0] === v)));
    if (k < 0) return false;
    used.add(k);
  }
  return true;
}
