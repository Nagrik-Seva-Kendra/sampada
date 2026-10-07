/**
 * Customer questions the bot could not answer (customer-questions.spec.ts):
 * the owner's commands to answer / remember them, and matching a new
 * question to a remembered answer. Pure.
 */
import { normDigits } from "./intake-rules.js";
import { soundKey } from "./name-sound.js";

export type QuestionCommand =
  | { kind: "answer"; n: number; answer: string }
  | { kind: "learn"; n: number }
  | { kind: "forget"; n: number }
  | { kind: "list" };

/**
 * "जवाब 12 हाँ हो सकती है" / "jawab #12: ..." → answer question 12;
 * "याद रखो 12" → remember that answer; "भूल जाओ 12" → stop using it;
 * "सवाल" / "sawal" → the open questions.
 */
export function parseQuestionCommand(text: string): QuestionCommand | null {
  const t = normDigits(text).trim();
  const a = t.match(/^(जवाब|ज़वाब|jawab|javab|jvab|answer|ans|उत्तर|uttar)\s*#?(\d{1,5})\s*[:：\-–.]?\s*([\s\S]+)$/i);
  if (a && a[3]!.trim().length >= 2) return { kind: "answer", n: Number(a[2]), answer: a[3]!.trim() };
  const l = t.match(/^(याद\s*रखो|याद\s*रखें|yaad\s*rakho|yad\s*rakho|yaad\s*rakhna|remember|सीख\s*लो|seekh\s*lo|sikh\s*lo)\s*#?(\d{1,5})[\s.।!]*$/i);
  if (l) return { kind: "learn", n: Number(l[2]) };
  const f = t.match(/^(भूल\s*जाओ|भूलो|bhool\s*jao|bhul\s*jao|bhulo|forget)\s*#?(\d{1,5})[\s.।!]*$/i);
  if (f) return { kind: "forget", n: Number(f[2]) };
  if (/^(सवाल|सवालों|sawal|swal|savaal|questions?|ग्राहकों के सवाल|grahakon ke sawal|खुले सवाल|khule sawal)[\s?।.!]*$/i.test(t)) return { kind: "list" };
  return null;
}

/** Filler words that say nothing about what is asked. */
const FILLER = new Set(
  [
    "kya", "kyaa", "hai", "h", "hain", "he", "ka", "ki", "ke", "ko", "se", "me", "mein", "main", "mai", "to", "toh", "bhi", "ye", "yah", "yeh",
    "vo", "wo", "woh", "aur", "ya", "par", "pe", "kaise", "kese", "kab", "kitna", "kitni", "kitne", "kaun", "kahan", "hoga", "hogi", "honge",
    "sakta", "sakti", "sakte", "skta", "skti", "hota", "hoti", "hote", "kar", "karna", "karni", "karne", "kare", "karen", "karu", "karoon",
    "mujhe", "hume", "humein", "hamko", "mera", "meri", "mere", "apka", "aapka", "aapki", "apki", "sir", "ji", "please", "plz", "bataye",
    "batao", "btao", "bataiye", "the", "a", "an", "is", "are", "can", "i", "my", "of", "for", "to", "in", "on", "what", "how", "when", "do",
    "does", "will", "be", "it", "this", "that", "hello", "hi", "namaste", "ab", "abhi", "agar", "jo", "liye", "lie", "wala", "wali", "wale",
    "usko", "isko", "unko", "inko", "uske", "iske", "nahi", "nhi", "nahin", "raha", "rahi", "rahe", "gaya", "gayi", "gaye", "tha", "thi", "the",
  ].map((w) => soundKey(w).replace(/g/g, "j")),
);

/** A question's content words as sound keys ("रजिस्ट्री" and "registry" match). */
export function questionKeys(text: string): string[] {
  const words = normDigits(text)
    .toLowerCase()
    .split(/[^\p{L}\p{M}\d]+/u)
    .filter(Boolean);
  const keys = new Set<string>();
  for (const w of words) {
    // "registry" / "रजिस्ट्री": g and j sound alike here.
    const k = /^\d+$/.test(w) ? w : soundKey(w).replace(/g/g, "j");
    if (k.length >= 2 && !FILLER.has(k)) keys.add(k);
  }
  return [...keys];
}

/**
 * The remembered answer whose question this one matches: at least two content
 * words in common, covering 70% of the new question's words and half of the
 * remembered one's. Null when none is close enough.
 */
export function matchLearned<T extends { keys: string[] }>(text: string, learned: T[]): T | null {
  const q = new Set(questionKeys(text));
  if (q.size < 2) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of learned) {
    const common = item.keys.filter((k) => q.has(k)).length;
    if (common < 2) continue;
    const ofNew = common / q.size;
    const ofOld = common / item.keys.length;
    if (ofNew < 0.7 || ofOld < 0.5) continue;
    const score = ofNew + ofOld;
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}

export const answerToCustomerText = (answer: string) => `📩 आपके सवाल का जवाब — नागरिक सेवा केंद्र:\n${answer}\n\nकुछ और पूछना हो तो यहीं लिखें।`;
export const learnedReplyText = (answer: string) => `${answer}\n\n(और जानकारी के लिए 4 लिखें — हमारा स्टाफ बात करेगा।)`;
