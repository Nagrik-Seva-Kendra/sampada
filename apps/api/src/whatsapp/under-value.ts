/**
 * The owner's warning when a registry is done far below the guideline value
 * (under-value.spec.ts): income tax may send a below-valuation notice, and the
 * customer -- not the office -- answers for it. Pure.
 */
import { inr } from "./intake-rules.js";

/** Below this share of the guideline value the warning is given (income tax allows a 10% difference). */
export const UNDER_VALUE_SHARE = 0.9;

export function underValueWarning(amount: number | null | undefined, guideline: number | null | undefined): string | null {
  if (!amount || !guideline || amount >= guideline * UNDER_VALUE_SHARE) return null;
  return (
    `⚠️ चेतावनी: आपकी संपत्ति का गाइडलाइन मूल्य ₹${inr(Math.round(guideline))} है और आप रजिस्ट्री ₹${inr(Math.round(amount))} पर कर रहे हैं। ` +
    "इतनी कम राशि का कोई ठोस कारण न हो तो आयकर विभाग से कम मूल्यांकन (below valuation) पर रजिस्ट्री करने का नोटिस आ सकता है। " +
    "इसकी पूरी ज़िम्मेदारी आपकी होगी — नागरिक सेवा केंद्र का इससे कोई लेना-देना नहीं होगा।"
  );
}
