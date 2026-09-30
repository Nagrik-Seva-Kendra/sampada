/**
 * Pure helpers for ID-card photos (Aadhaar front/back, PAN): turning what the
 * vision reader returned into checked values, and the cross-checks that put a
 * request on "स्टाफ जाँच". No Nest/Prisma imports (id-cards.spec.ts).
 *
 * Never log anything returned here -- it is the customer's Aadhaar/PAN data.
 */
import { type IdPhotoKind, type IdWarningKind, namesMatch } from "@sampada/shared";
import { normDigits, validAadhaar, validPan } from "./intake-rules.js";

/** Raw JSON the reader returns (every field may be missing or null). */
export interface IdCardRaw {
  readable?: boolean | null;
  cardType?: string | null; // "aadhaar_front" | "aadhaar_back" | "aadhaar_both" | "pan" | "other"
  nameEn?: string | null;
  nameHi?: string | null;
  dob?: string | null;
  gender?: string | null;
  address?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  fatherNameEn?: string | null;
}

export interface AadhaarFrontRead {
  aadhaar: string;
  name: string;
  nameEn: string | null;
  dob: string | null;
  gender: "पुरुष" | "महिला" | "अन्य" | null;
  /** Some cards (e-Aadhaar, letters) carry the address on the front. */
  address: string | null;
}
export interface AadhaarBackRead {
  address: string;
  aadhaar: string | null;
}
export interface PanRead {
  pan: string;
  nameEn: string;
  fatherEn: string | null;
  dob: string | null;
}
export type IdReadResult<T> = { ok: true; value: T } | { ok: false; reason: "unreadable" | "wrongCard" };

const s = (v: unknown, min = 1): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length >= min ? t : null;
};

/** "15/08/1985", "15-08-1985", "1985-08-15" → "15/08/1985"; a bare year (old cards) stays "1985". */
export function normDob(v: unknown): string | null {
  const t = s(v);
  if (!t) return null;
  const d = normDigits(t);
  let m = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[3]}`;
  m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return /^(19|20)\d{2}$/.test(d) ? d : null;
}

export function normGender(v: unknown): AadhaarFrontRead["gender"] {
  const t = (s(v) ?? "").toLowerCase();
  if (/^(m|male|पुरुष)$/.test(t)) return "पुरुष";
  if (/^(f|female|महिला|स्त्री)$/.test(t)) return "महिला";
  if (/^(t|transgender|other|अन्य|ट्रांसजेंडर)$/.test(t)) return "अन्य";
  return null;
}

const isAadhaarCard = (t: unknown) => typeof t === "string" && /^aadhaar/.test(t);

/**
 * Checks what the reader saw on a photo sent for `kind`. The Aadhaar number
 * must pass the Verhoeff check and the PAN the PAN pattern; anything less is
 * "unreadable" (ask for a clearer photo) -- never guessed.
 */
export function mapIdRead(kind: "aadhaarFront", raw: IdCardRaw | null): IdReadResult<AadhaarFrontRead>;
export function mapIdRead(kind: "aadhaarBack", raw: IdCardRaw | null): IdReadResult<AadhaarBackRead>;
export function mapIdRead(kind: "pan", raw: IdCardRaw | null): IdReadResult<PanRead>;
export function mapIdRead(kind: Exclude<IdPhotoKind, "passportPhoto">, raw: IdCardRaw | null): IdReadResult<unknown> {
  if (!raw || raw.readable === false) return { ok: false, reason: "unreadable" };
  if (kind === "pan") {
    if (raw.cardType && raw.cardType !== "pan") return { ok: false, reason: isAadhaarCard(raw.cardType) || raw.cardType === "other" ? "wrongCard" : "unreadable" };
    const pan = validPan(s(raw.panNumber) ?? "");
    const nameEn = s(raw.nameEn, 2);
    if (!pan || !nameEn) return { ok: false, reason: "unreadable" };
    return { ok: true, value: { pan, nameEn, fatherEn: s(raw.fatherNameEn, 2), dob: normDob(raw.dob) } satisfies PanRead };
  }
  if (raw.cardType && !isAadhaarCard(raw.cardType)) return { ok: false, reason: raw.cardType === "pan" || raw.cardType === "other" ? "wrongCard" : "unreadable" };
  const aadhaar = validAadhaar(s(raw.aadhaarNumber) ?? "");
  if (kind === "aadhaarFront") {
    const name = s(raw.nameHi, 2) ?? s(raw.nameEn, 2);
    if (!aadhaar || !name) return { ok: false, reason: "unreadable" };
    return {
      ok: true,
      value: { aadhaar, name, nameEn: s(raw.nameEn, 2), dob: normDob(raw.dob), gender: normGender(raw.gender), address: s(raw.address, 8) } satisfies AadhaarFrontRead,
    };
  }
  const address = s(raw.address, 8);
  if (!address) return { ok: false, reason: "unreadable" };
  return { ok: true, value: { address, aadhaar } satisfies AadhaarBackRead };
}

/** What was read for one person, kept (numbers encrypted) in DraftIntake.data.idRead[prefix]. */
export interface PartyIdRead {
  aadhaarName?: string | null;
  aadhaarNameEn?: string | null;
  panName?: string | null;
  panFather?: string | null;
  /** A photo was not readable after two tries → typed + staff check. */
  unreadable?: boolean;
}

/**
 * Cross-checks for one person:
 *  - the name on the Aadhaar vs the name on the PAN;
 *  - the father's name on the PAN vs the one the customer typed -- only when the
 *    typed name is the father's (a wife's "पति का नाम" is not on the PAN).
 */
export function idWarningsFor(read: PartyIdRead | null | undefined, typed: { fatherName?: unknown; relation?: unknown }): IdWarningKind[] {
  if (!read) return [];
  const out: IdWarningKind[] = [];
  if (namesMatch(read.aadhaarNameEn || read.aadhaarName, read.panName) === false) out.push("aadhaarPanName");
  if (typed.relation !== "पत्नी" && typeof typed.fatherName === "string" && namesMatch(read.panFather, typed.fatherName) === false) {
    out.push("panFather");
  }
  if (read.unreadable) out.push("unreadable");
  return out;
}
