import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * Minimal S3-compatible client for Cloudflare R2, using only Node's built-in
 * crypto for AWS SigV4 signing + global fetch — no extra npm dependency (so the
 * frozen-lockfile build stays intact). Configured entirely via env vars; when
 * they're absent, r2Configured() is false and the guideline feature falls back
 * to storing bytes in Postgres (backward compatible).
 */
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;
const REGION = "auto";
const SERVICE = "s3";

export function r2Configured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY && SECRET_KEY && BUCKET);
}

function host(): string {
  return `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** Encode each path segment per AWS rules, keeping "/" as separators. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function amzDates(): { amzDate: string; dateStamp: string } {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(dateStamp: string): Buffer {
  const kDate = hmac("AWS4" + SECRET_KEY, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

async function signedRequest(
  method: "PUT" | "GET",
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<Response> {
  if (!r2Configured()) throw new Error("R2 is not configured (missing R2_* env vars).");
  const { amzDate, dateStamp } = amzDates();
  const canonicalUri = "/" + encodeKey(BUCKET as string) + "/" + encodeKey(key);
  const payloadHash = sha256Hex(body);
  const h = host();

  const canonicalHeaders =
    (contentType ? `content-type:${contentType}\n` : "") +
    `host:${h}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders =
    (contentType ? "content-type;" : "") + "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(dateStamp))
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Note: the "host" header is set automatically by fetch/undici from the URL
  // (it's a forbidden header to set manually), and it matches what we signed.
  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    authorization,
  };
  if (contentType) headers["content-type"] = contentType;

  return fetch(`https://${h}${canonicalUri}`, {
    method,
    headers,
    body: method === "PUT" ? body : undefined,
  });
}

/** Upload an object to R2. Throws on non-2xx. */
export async function r2Put(
  key: string,
  body: Buffer,
  contentType = "application/pdf",
): Promise<void> {
  const res = await signedRequest("PUT", key, body, contentType);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`R2 PUT ${key} failed: HTTP ${res.status} ${t.slice(0, 300)}`);
  }
}

/** Download an object from R2 as a Buffer. Throws on non-2xx. */
export async function r2Get(key: string): Promise<Buffer> {
  const res = await signedRequest("GET", key, Buffer.alloc(0));
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`R2 GET ${key} failed: HTTP ${res.status} ${t.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** A fresh object key for a guideline PDF. */
export function newGuidelineKey(): string {
  return `guidelines/${randomUUID()}.pdf`;
}
