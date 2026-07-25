import { randomInt } from "node:crypto";

/** Narrow shape so the retry loops below are unit-testable without a real Prisma client. */
export interface OrgLookupClient {
  organization: { findUnique(args: { where: { slug?: string; joinCode?: string } }): Promise<{ id: string } | null> };
}

/** Excludes 0/O/1/I/L — a joinCode is meant to be read aloud/typed by hand, unlike a secret OTP. */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Lowercase, strip to [a-z0-9-], collapse/trim dashes; "org" if nothing survives. */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "org";
}

/** Tries slugify(name), then "-2", "-3", ... on collision, then a random suffix as a last resort. */
export async function generateUniqueSlug(prisma: OrgLookupClient, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
  return `${base}-${randomInt(1000, 9999)}`;
}

/** Random human-shareable code, e.g. "K7M2-9XQR" for an 8-char length. */
export function generateJoinCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/** Retries on collision; widens the code length after repeated misses before giving up. */
export async function generateUniqueJoinCode(prisma: OrgLookupClient): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = generateJoinCode(attempt > 3 ? 10 : 8);
    const existing = await prisma.organization.findUnique({ where: { joinCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique join code after several attempts.");
}
