import { describe, it, expect, vi } from "vitest";
import {
  slugify,
  generateJoinCode,
  generateUniqueSlug,
  generateUniqueJoinCode,
  type OrgLookupClient,
} from "./organization-codes.js";

/** Fake client whose findUnique returns a collision for the first `collisions` calls, then null. */
function fakeClient(collisions: number): OrgLookupClient {
  let calls = 0;
  return {
    organization: {
      findUnique: vi.fn(async () => {
        calls++;
        return calls <= collisions ? { id: "existing" } : null;
      }),
    },
  };
}

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Nagrik Seva Kendra")).toBe("nagrik-seva-kendra");
  });

  it("strips punctuation and collapses runs of non-alnum", () => {
    expect(slugify("Acme & Co. — Pvt Ltd!!")).toBe("acme-co-pvt-ltd");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Weird Name--  ")).toBe("weird-name");
  });

  it("falls back to \"org\" when nothing survives", () => {
    expect(slugify("!!!")).toBe("org");
  });
});

describe("generateJoinCode", () => {
  it("defaults to length 8 from the expected alphabet", () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });

  it("excludes ambiguous characters 0/O/1/I/L", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateJoinCode(20)).not.toMatch(/[0O1IL]/);
    }
  });

  it("respects a custom length", () => {
    expect(generateJoinCode(10)).toHaveLength(10);
  });
});

describe("generateUniqueSlug", () => {
  it("returns the plain slug when it's free", async () => {
    const client = fakeClient(0);
    expect(await generateUniqueSlug(client, "Acme Inc")).toBe("acme-inc");
  });

  it("retries with -2, -3, ... on collision", async () => {
    const client = fakeClient(2);
    expect(await generateUniqueSlug(client, "Acme Inc")).toBe("acme-inc-3");
  });
});

describe("generateUniqueJoinCode", () => {
  it("returns a code on the first try when free", async () => {
    const client = fakeClient(0);
    const code = await generateUniqueJoinCode(client);
    expect(code).toHaveLength(8);
  });

  it("retries on collision and eventually succeeds", async () => {
    const client = fakeClient(2);
    const code = await generateUniqueJoinCode(client);
    expect(typeof code).toBe("string");
  });

  it("throws after exhausting attempts", async () => {
    const client = fakeClient(999);
    await expect(generateUniqueJoinCode(client)).rejects.toThrow(/unique join code/);
  });
});
