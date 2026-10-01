import { z } from "zod";

/**
 * The office's own charges quoted by the WhatsApp bot ("रजिस्ट्री खर्च जानना").
 * Total charges, writing fee included. Stamp duty / registration fee are
 * separate (government). Owner-editable from the web (PUT /whatsapp/fees).
 */
export const WaOfficeFees = z
  .object({
    /** Sale deed (registry): by the higher of consideration and guideline value; ascending. */
    registrySlabs: z
      .array(z.object({ upTo: z.number().int().positive(), fee: z.number().int().nonnegative() }))
      .min(1)
      .max(10),
    /** Above the last slab: null → "कार्यालय बताएगा". */
    registryAbove: z.number().int().nonnegative().nullable(),
    gdaPatta: z.number().int().nonnegative(),
    otherDocs: z.number().int().nonnegative(),
  })
  .strict();
export type WaOfficeFees = z.infer<typeof WaOfficeFees>;

export const DEFAULT_OFFICE_FEES: WaOfficeFees = {
  registrySlabs: [
    { upTo: 5_000_000, fee: 5_500 },
    { upTo: 7_500_000, fee: 6_500 },
  ],
  registryAbove: null,
  gdaPatta: 10_000,
  otherDocs: 6_000,
};

export type WaFeeKind = "registry" | "gdaPatta" | "other";

/**
 * Office fee for a document. Registry: the slab of max(consideration, guideline
 * value) -- "up to 50 lakh" includes 50 lakh exactly. null = office will tell.
 */
export function officeFeeFor(kind: WaFeeKind, value: number | null | undefined, cfg: WaOfficeFees = DEFAULT_OFFICE_FEES): number | null {
  if (kind === "gdaPatta") return cfg.gdaPatta;
  if (kind === "other") return cfg.otherDocs;
  if (!(typeof value === "number" && value > 0)) return null;
  const slabs = [...cfg.registrySlabs].sort((a, b) => a.upTo - b.upTo);
  return slabs.find((s) => value <= s.upTo)?.fee ?? cfg.registryAbove;
}

/** A WhatsApp number the bot stopped answering (spam / abuse); OWNER/ADMIN can unblock. */
export interface WaBlockedContact {
  phone: string;
  phoneMasked: string;
  reason: "spam" | "abuse";
  blockedAt: string;
}
