/**
 * A company's sale paper (photo / PDF sent on WhatsApp) → a colony sale
 * (colony-paper.spec.ts): what the model must return, and turning its answer
 * into buyers / payment the deed can use. Pure. Aadhaar / PAN are checked for
 * shape only and never logged.
 */
import { type ColonyBuyer, type Instalment, PaymentMode } from "@sampada/shared";
import { Injectable, Logger } from "@nestjs/common";

export const PAPER_SYSTEM = `You read a property-sale information paper from a colony developer in Madhya Pradesh (India), handwritten or typed, in Hindi or English. It may be several pages / photos (details, payment table, plot map): read them all together as ONE sale.
Return ONLY one JSON object (no prose, no markdown):
{"project": string|null,
 "plot": {"block": string|null, "plotNo": string|null},
 "buyers": [{"name": string, "relation": "पुत्र"|"पुत्री"|"पत्नी"|null, "guardian": string|null, "motherName": string|null,
             "address": string|null, "mobile": string|null, "email": string|null, "aadhaar": string|null, "pan": string|null}],
 "consideration": number|null,
 "instalments": [{"date": "YYYY-MM-DD"|null, "amount": number|null, "mode": "cash"|"cheque"|"upi"|"rtgs"|"dd"|"loan"|null, "ref": string|null}],
 "partner": string|null}
Rules:
- Copy names, addresses and numbers exactly as written; keep Devanagari as-is. Use null for anything not clearly readable. Never guess.
- relation: पुत्र for S/O / son of, पुत्री for D/O / daughter of, पत्नी for W/O / wife of; guardian is the father's / husband's name after it.
- plot: "E-47" → block "E", plotNo "47"; a plot without a block → block null.
- consideration: the total sale amount in rupees (15 लाख = 1500000).
- instalments: every payment with its date, amount, mode (नकद=cash, चेक=cheque, UPI/ऑनलाइन/NEFT/IMPS=upi, RTGS=rtgs, DD=dd, बैंक लोन=loan) and cheque / UTR number as ref.
- partner: the company partner / signatory named on the paper (who signs for the company), else null.`;

export interface PaperRaw {
  project?: string | null;
  plot?: { block?: string | null; plotNo?: string | null } | null;
  buyers?: Record<string, unknown>[] | null;
  consideration?: number | string | null;
  instalments?: Record<string, unknown>[] | null;
  partner?: string | null;
}

export interface PaperSale {
  project: string | null;
  plot: { block: string; plotNo: string } | null;
  buyers: ColonyBuyer[];
  consideration: number | null;
  instalments: Instalment[];
  partner: string | null;
  /** What the deed still needs (customer-facing, Hindi). */
  missing: string[];
}

const str = (v: unknown, max = 400): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const DEV_DIGITS = "०१२३४५६७८९";
const digits = (v: unknown): string => str(v).replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d))).replace(/\D/g, "");
const money = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  const d = digits(v);
  return d ? Number(d) : null;
};

const RELATION: Record<string, ColonyBuyer["relation"]> = { पुत्र: "पुत्र", पुत्री: "पुत्री", पत्नी: "पत्नी" };
function relationOf(v: unknown): ColonyBuyer["relation"] | null {
  const s = str(v).toLowerCase();
  if (RELATION[s]) return RELATION[s]!;
  if (/^(s\/?o|son)/.test(s)) return "पुत्र";
  if (/^(d\/?o|daughter)/.test(s)) return "पुत्री";
  if (/^(w\/?o|wife)/.test(s)) return "पत्नी";
  return null;
}

/** "2026-10-05", "05/10/2026", "5-10-26" → "2026-10-05"; anything else null. */
export function isoDate(v: unknown): string | null {
  const s = str(v).replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** What the deed still needs, on the sale as it now stands (this paper merged with an earlier one of the same plot). */
export function saleGaps(s: {
  buyers: { name: string; guardian: string; hasAadhaar: boolean }[];
  consideration: number | null;
  instalments: Instalment[];
}): string[] {
  const out: string[] = [];
  if (!s.buyers.length) out.push("क्रेता का नाम");
  s.buyers.forEach((b, i) => {
    const n = s.buyers.length > 1 ? ` ${i + 1}` : "";
    if (b.name.trim().length < 2) out.push(`क्रेता${n} का नाम`);
    if (!b.guardian.trim()) out.push(`क्रेता${n} के पिता / पति का नाम`);
    if (!b.hasAadhaar) out.push(`क्रेता${n} का आधार`);
  });
  if (!s.consideration) out.push("कुल राशि (प्रतिफल)");
  if (!s.instalments.length) out.push("भुगतान की किश्तें (तारीख, राशि, माध्यम)");
  const total = s.instalments.reduce((a, x) => a + x.amount, 0);
  if (s.consideration && s.instalments.length && total !== s.consideration) {
    out.push(`किश्तों का जोड़ ₹${total.toLocaleString("en-IN")} कुल राशि ₹${s.consideration.toLocaleString("en-IN")} के बराबर नहीं`);
  }
  return out;
}

/** The model's answer → a sale the deed can use, and what is still missing. */
export function mapPaper(raw: PaperRaw | null): PaperSale {
  const missing: string[] = [];
  const block = str(raw?.plot?.block, 10).toUpperCase().replace(/[^A-Z0-9ऀ-ॿ]/g, "");
  const plotNo = str(raw?.plot?.plotNo, 20).replace(/^(प्लाट|प्लॉट|plot)\s*(नं\.?|no\.?|नंबर)?\s*/i, "").replace(/\s+/g, "");
  const plot = plotNo ? { block, plotNo } : null;
  if (!plot) missing.push("प्लाट नंबर");

  const buyers: ColonyBuyer[] = [];
  for (const [i, b] of (raw?.buyers ?? []).slice(0, 4).entries()) {
    const n = (raw?.buyers?.length ?? 0) > 1 ? ` ${i + 1}` : "";
    const name = str(b.name, 120).replace(/^(श्री|श्रीमती|सुश्री|mr\.?|mrs\.?|ms\.?)\s+/i, "");
    const relation = relationOf(b.relation);
    const guardian = str(b.guardian, 120).replace(/^(श्री|स्व\.?|late)\s+/i, "");
    const aadhaar = digits(b.aadhaar);
    const pan = str(b.pan, 12).toUpperCase().replace(/\s+/g, "");
    if (name.length < 2) missing.push(`क्रेता${n} का नाम`);
    if (!relation || !guardian) missing.push(`क्रेता${n} के पिता / पति का नाम`);
    if (aadhaar && aadhaar.length !== 12) missing.push(`क्रेता${n} का आधार (12 अंक साफ़ नहीं)`);
    if (!aadhaar) missing.push(`क्रेता${n} का आधार`);
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) missing.push(`क्रेता${n} का PAN (साफ़ नहीं)`);
    buyers.push({
      name,
      relation: relation ?? "पुत्र",
      guardian,
      motherName: str(b.motherName, 120),
      address: str(b.address, 400),
      mobile: digits(b.mobile).slice(-10),
      email: str(b.email, 120),
      aadhaar: aadhaar.length === 12 ? aadhaar : "",
      pan: /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : "",
    });
  }
  if (!buyers.length) missing.push("क्रेता का नाम");

  const consideration = money(raw?.consideration);
  if (!consideration) missing.push("कुल राशि (प्रतिफल)");

  const instalments: Instalment[] = [];
  for (const x of (raw?.instalments ?? []).slice(0, 20)) {
    const date = isoDate(x.date);
    const amount = money(x.amount);
    const mode = PaymentMode.safeParse(x.mode);
    if (!date || !amount || !mode.success) {
      missing.push(`भुगतान की एक किश्त की ${!date ? "तारीख" : !amount ? "राशि" : "माध्यम (नकद / चेक / ऑनलाइन)"}`);
      continue;
    }
    instalments.push({ date, amount, mode: mode.data, ref: str(x.ref, 120) });
  }
  if (!instalments.length && !missing.some((m) => m.startsWith("भुगतान"))) missing.push("भुगतान की किश्तें (तारीख, राशि, माध्यम)");
  const total = instalments.reduce((a, x) => a + x.amount, 0);
  if (consideration && instalments.length && total !== consideration) {
    missing.push(`किश्तों का जोड़ ₹${total.toLocaleString("en-IN")} कुल राशि ₹${consideration.toLocaleString("en-IN")} के बराबर नहीं`);
  }
  return { project: str(raw?.project, 120) || null, plot, buyers, consideration, instalments, partner: str(raw?.partner, 120) || null, missing };
}

/** The project's partner the paper names (label, key or a word of its text); the only one if there is one. */
export function matchPartner<T extends { key: string; label: string; text: string }>(partners: T[], named: string | null): T | null {
  if (partners.length === 1) return partners[0]!;
  if (!named) return null;
  const n = named.toLowerCase().replace(/^(श्री|mr\.?)\s+/, "").trim();
  const hits = partners.filter((p) => p.label.toLowerCase().includes(n) || n.includes(p.label.toLowerCase()) || p.key.toLowerCase() === n || p.text.toLowerCase().includes(n));
  return hits.length === 1 ? hits[0]! : null;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Reads the paper with Claude (same call as the deed extractor); null when unreadable or not configured. */
@Injectable()
export class ColonyPaperExtractor {
  private readonly log = new Logger("ColonyPaper");

  /** All pages / photos of one paper in one request. */
  async extract(files: { buf: Buffer; mime: string }[]): Promise<PaperRaw | null> {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const blocks = files
      .slice(0, 10)
      .map(({ buf, mime }) => {
        const data = buf.toString("base64");
        return mime === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
          : IMAGE_TYPES.includes(mime)
            ? { type: "image", source: { type: "base64", media_type: mime, data } }
            : null;
      })
      .filter(Boolean);
    if (!blocks.length) return null;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 3000,
        system: PAPER_SYSTEM,
        messages: [{ role: "user", content: [...blocks, { type: "text", text: "Extract the JSON." }] }],
      }),
    }).catch(() => null);
    if (!res?.ok) {
      // Status only: the body may echo the paper.
      this.log.error(`paper read failed ${res?.status ?? "network"}`);
      return null;
    }
    const json: any = await res.json().catch(() => null);
    const text: string = json?.content?.find((c: any) => c.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    try {
      return m ? (JSON.parse(m[0]) as PaperRaw) : null;
    } catch {
      return null;
    }
  }
}
