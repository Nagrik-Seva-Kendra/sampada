/**
 * A spelling-proof key for place names in Hindi or English (name-sound.spec.ts):
 * "Scindia" ≈ "Shindiya" ≈ "सिंधिया", "City Center" ≈ "सिटी सेंटर",
 * "Thatipur" ≈ "थाटीपुर". Devanagari is written in Latin letters, then
 * vowels, h and doubled letters are dropped and look-alike sounds merged.
 * Pure; used only to compare names, never shown.
 */
const DEV: Record<string, string> = {
  क: "k", ख: "k", ग: "g", घ: "g", ङ: "n", च: "C", छ: "C", ज: "j", झ: "j", ञ: "n",
  ट: "t", ठ: "t", ड: "d", ढ: "d", ण: "n", त: "t", थ: "t", द: "d", ध: "d", न: "n",
  प: "p", फ: "f", ब: "b", भ: "b", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "s",
  ष: "s", स: "s", ह: "h", ळ: "l", "ड़": "r", "ढ़": "r", "क़": "k", "ख़": "k", "ग़": "g", "ज़": "j", "फ़": "f",
  अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ऋ: "r", ए: "e", ऐ: "e", ओ: "o", औ: "o", ऑ: "o",
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "r", "े": "e", "ै": "e", "ो": "o", "ौ": "o", "ॉ": "o",
  "ं": "n", "ँ": "n", "ः": "", "्": "", "़": "",
};

/** Devanagari → rough Latin letters (other characters kept). */
export function devToLatin(s: string): string {
  let out = "";
  const chars = [...s.normalize("NFC").replace(/[​-‍﻿]/g, "")];
  for (let i = 0; i < chars.length; i++) {
    const two = chars[i]! + (chars[i + 1] ?? "");
    if (DEV[two] !== undefined) {
      out += DEV[two];
      i++;
    } else out += DEV[chars[i]!] ?? chars[i];
  }
  return out;
}

/** One word → its sound key ("Shindiya" / "Scindia" / "सिंधिया" → "snd"). */
export function soundKey(word: string): string {
  let s = devToLatin(word).toLowerCase().replace(/[^a-zC]/g, "");
  s = s
    .replace(/ch/g, "C")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/sc(?=[eiy])/g, "s")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "j")
    .replace(/w/g, "v")
    .replace(/C/g, "c")
    .replace(/h/g, "")
    // Doubled letters before vowels go ("Gwallior" = "Gwalior"), so "Morar" (mrr) stays apart from "Meera" (mr).
    .replace(/(.)\1+/g, "$1")
    .replace(/[aeiouy]/g, "");
  return s;
}

const tokensOf = (s: string) => s.split(/[^A-Za-zऀ-ॿ]+/).filter(Boolean);

/**
 * Whether every word of `name` is in `place` (its Hindi and English names
 * together), by sound; a name written joined ("gangavihar") also matches
 * the same words written apart. Words under 3 letters are ignored.
 */
export function soundsIn(name: string, place: string): boolean {
  const want = tokensOf(name).filter((w) => w.length >= 3).map(soundKey).filter((k) => k.length >= 2);
  if (!want.length) return false;
  const have = tokensOf(place).map(soundKey).filter(Boolean);
  const set = new Set(have);
  const joined = new Set<string>();
  for (let i = 0; i < have.length; i++) for (let n = 2; n <= 3 && i + n <= have.length; n++) joined.add(have.slice(i, i + n).join(""));
  return want.every((k) => set.has(k) || joined.has(k));
}
