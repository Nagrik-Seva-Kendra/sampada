import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Aadhaar/PAN at-rest encryption for WhatsApp draft requests
 * (AES-256-GCM, DATA_ENC_KEY = 64 hex chars). Stored as "enc:" + base64(iv|tag|ct).
 */
const encKey = () => Buffer.from(process.env.DATA_ENC_KEY ?? "", "hex");

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "enc:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Values without the "enc:" prefix are returned unchanged. */
export function decrypt(v: string): string {
  if (!v?.startsWith("enc:")) return v;
  const b = Buffer.from(v.slice(4), "base64");
  const d = createDecipheriv("aes-256-gcm", encKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

/** "XXXX" + last 4 characters; "—" for empty. */
export const mask = (v: string) => (v ? "XXXX" + v.slice(-4) : "—");
