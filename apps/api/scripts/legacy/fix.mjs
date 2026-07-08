// Recover Hindi text that was double-encoded (UTF-8 stored in a cp1252/latin1
// column, then exported). Reverse: map each JS char back to its source byte,
// then decode the byte stream as UTF-8. Also restores the legacy "rn"
// line-break encoding (where the backslashes of \r\n were stripped).
const REPLACEMENT = "�";
const CP1252_REV = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
  "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

export function fixText(s) {
  if (typeof s !== "string" || !s) return s ?? "";
  const bytes = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xff) { bytes.push(cp); continue; }
    if (CP1252_REV[ch] !== undefined) { bytes.push(CP1252_REV[ch]); continue; }
    return stripBad(s); // char outside mojibake alphabet → already clean
  }
  const dec = Buffer.from(bytes).toString("utf8");
  return stripBad(dec);
}

/** Drop a trailing broken byte (varchar truncation left a lone replacement char). */
function stripBad(s) {
  return s.split(REPLACEMENT).join("").trimEnd();
}

/** Text cleanup for deed bodies: fix encoding + restore stripped \r\n. */
export function fixContent(s) {
  return fixText(s)
    .replace(/\r\n/g, "\n")
    .replace(/rn/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
