/**
 * A customer who asked (cost, how to start, a will / gift deed) but never sent
 * papers gets one reminder the next day -- inside WhatsApp's 24-hour window,
 * so it is ordinary text, no template (lead-nudge.spec.ts). Pure.
 */

export type LeadKind = "draft" | "cost" | "other-doc" | "question";

/** Front-door routes that show interest in work. */
export function leadKindOf(route: string): LeadKind | null {
  if (route === "draft-howto" || route === "draft-question" || route === "deed-words") return "draft";
  if (route === "cost") return "cost";
  if (route === "faq-other-doc" || route === "mutation") return "other-doc";
  if (/^faq-(seller-died|nri|loan|lease-plot|joint|minor|registry-cancel)$/.test(route)) return "question";
  return null;
}

/** Routes after which no reminder goes: the customer closed, or asked for staff. */
export const LEAD_ENDS = new Set(["closed", "staff", "followup"]);

/** Sent between 20 and 23 hours after the customer's last message (the window closes at 24). */
export const NUDGE_AFTER_MS = 20 * 3600_000;
export const NUDGE_BEFORE_MS = 23 * 3600_000;
/** At most one reminder per number in this time. */
export const NUDGE_GAP_MS = 7 * 24 * 3600_000;

/** Office-friendly hours, 9:00–20:30 IST. */
export function nudgeHours(now: Date): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return m >= 9 * 60 && m < 20 * 60 + 30;
}

const ABOUT: Record<LeadKind, string> = {
  draft: "रजिस्ट्री / ड्राफ्ट",
  cost: "रजिस्ट्री के खर्च",
  "other-doc": "दस्तावेज़ बनवाने",
  question: "अपनी संपत्ति के काम",
};

export function nudgeText(kind: LeadKind): string {
  return (
    `🙏 नमस्ते! आपने ${ABOUT[kind]} के बारे में पूछा था — आपका काम अभी शुरू नहीं हुआ है।\n` +
    "• शुरू करने के लिए पुरानी रजिस्ट्री / संपत्ति के कागज़ की PDF या साफ़ फ़ोटो यहीं भेज दें।\n" +
    "• कुछ पूछना हो तो लिखें, या 4 लिखें — हमारा स्टाफ आपसे बात करेगा।\n" +
    'आगे ऐसा संदेश न चाहिए तो "बंद" लिखें।'
  );
}
