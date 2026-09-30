import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyParty, DraftIntakeService, nextReuseCheck } from "./draft-intake.service.js";
import { validAadhaar } from "./intake-rules.js";
import { decrypt, encrypt } from "./pii-crypto.js";

const KEY = "d".repeat(64); // test-only key
const aadhaar = (base11: string) => {
  for (let d = 0; d <= 9; d++) if (validAadhaar(base11 + d)) return base11 + d;
  throw new Error("no check digit");
};
const OLD_AADHAAR = aadhaar("34567890123");
const NEW_AADHAAR = aadhaar("45678901234");
const MINE = "919755725648";
const OTHER = "919000000001";

beforeEach(() => {
  vi.stubEnv("DATA_ENC_KEY", KEY);
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const prevData = () => ({
  deedType: "sale",
  buyerName: "अमित शर्मा",
  buyerRelation: "पुत्र",
  buyerFatherName: "राजेश शर्मा",
  buyerMotherName: "सीता देवी",
  buyerAadhaar: encrypt(OLD_AADHAAR),
  buyerMobile: "9876543210",
  buyerEmail: "amit@example.com",
  buyerAddress: "लश्कर, ग्वालियर",
  buyerPan: encrypt("ABCPS1234K"),
});

/** A tiny DraftIntake table: rows filtered by the where clause the service passes. */
function db(rows: any[]) {
  const match = (r: any, w: any) =>
    Object.entries(w ?? {}).every(([k, v]: [string, any]) => v && typeof v === "object" ? ("not" in v ? r[k] !== v.not : true) /* updatedAt >= … */ : r[k] === v);
  return {
    draftIntake: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const found = rows.filter((r) => match(r, where));
        if (orderBy?.createdAt === "desc") found.sort((a, b) => b.createdAt - a.createdAt);
        return found[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
    },
  };
}

function convo(prev: any[], createdDaysAgo = 30) {
  const cur: any = { id: "cur-req-000001", organizationId: "org-1", phone: MINE, status: "ACTIVE", step: "CONFIRM_PROPERTY", data: {}, deed: null, needsStaff: false, createdAt: new Date() };
  const rows = [cur, ...prev.map((p) => ({ status: "SUBMITTED", organizationId: "org-1", createdAt: new Date(Date.now() - createdDaysAgo * 86400_000), ...p }))];
  const prisma = db(rows);
  // active() looks up the ACTIVE row by phone
  const svc = new DraftIntakeService(prisma as any, {} as any, {} as any, {} as any, { send: async () => ({}) } as any);
  return { cur, say: async (t: string) => (await svc.handleText({ phone: MINE, name: "अ" }, t))!.join("\n") };
}

describe("returning customer: reuse the last request's details (same number only)", () => {
  it("offers the old details masked; हाँ copies every field incl. encrypted Aadhaar/PAN and skips to what is left", async () => {
    const c = convo([{ id: "prev-req-00001", phone: MINE, data: prevData() }]);
    const offer = await c.say("हाँ");
    expect(offer).toContain(`पिछली बार की जानकारी (नाम: अमित शर्मा, आधार XXXX${OLD_AADHAAR.slice(-4)})`);
    expect(offer).not.toContain(OLD_AADHAAR);
    expect(c.cur.step).toBe("REUSE:buyer");

    const out = await c.say("हाँ");
    expect(out).toContain("पिछली बार की जानकारी भर दी गई");
    expect(c.cur.data).toMatchObject({ buyerName: "अमित शर्मा", buyerRelation: "पुत्र", buyerMotherName: "सीता देवी", buyerEmail: "amit@example.com" });
    expect(decrypt(c.cur.data.buyerAadhaar)).toBe(OLD_AADHAAR);
    expect(decrypt(c.cur.data.buyerPan)).toBe("ABCPS1234K");
    expect(c.cur.step).toBe("AMOUNT"); // every buyer question answered; ID photos skipped
  });

  it("नहीं → the normal flow (ID photos first)", async () => {
    const c = convo([{ id: "prev-req-00001", phone: MINE, data: prevData() }]);
    await c.say("हाँ");
    expect(await c.say("नहीं")).toContain("नए सिरे से");
    expect(c.cur.step).toBe("ID_PHOTO:buyer:aadhaarFront");
    expect(c.cur.data.buyerName).toBeUndefined();
  });

  it("another number's request is never offered", async () => {
    const c = convo([{ id: "prev-other-001", phone: OTHER, data: prevData() }]);
    await c.say("हाँ");
    expect(c.cur.step).toBe("ID_PHOTO:buyer:aadhaarFront");
    expect(JSON.stringify(c.cur.data)).not.toContain("अमित");
  });

  it("older than 12 months: every copied field is confirmed; a new value replaces the old one", async () => {
    const c = convo([{ id: "prev-req-00001", phone: MINE, data: prevData() }], 400);
    await c.say("हाँ");
    const first = await c.say("हाँ");
    expect(first).toContain("12 महीने से पुरानी");
    expect(first).toContain("पिछली बार: नाम — अमित शर्मा");
    expect(await c.say("हाँ")).toContain("संबंध");
    await c.say("हाँ"); // relation
    await c.say("हाँ"); // father
    await c.say("हाँ"); // mother
    expect(c.cur.step).toBe("REUSE_CHECK:buyer:Aadhaar");
    expect(await c.say("1234")).toContain("आधार नंबर सही नहीं");
    await c.say(NEW_AADHAAR);
    expect(decrypt(c.cur.data.buyerAadhaar)).toBe(NEW_AADHAAR);
    expect(c.cur.step).toBe("REUSE_CHECK:buyer:Mobile");
    await c.say("9123456780");
    expect(c.cur.data.buyerMobile).toBe("9123456780");
    await c.say("हाँ"); // email
    await c.say("हाँ"); // address
    expect(c.cur.step).toBe("REUSE_CHECK:buyer:Pan");
    await c.say("हाँ");
    expect(c.cur.step).toBe("AMOUNT");
  });

  it("helpers: copy re-keys a mortgage's mortgagor to the buyer; checks walk only copied fields", () => {
    const copied = copyParty({ deedType: "mortgage", mortgagorName: "सीता", mortgagorMobile: "9876543210", buyerName: "x" }, "buyer");
    expect(copied).toEqual({ buyerName: "सीता", buyerMobile: "9876543210" });
    expect(nextReuseCheck("buyer", copied)).toBe("REUSE_CHECK:buyer:Name");
    expect(nextReuseCheck("buyer", copied, "Name")).toBe("REUSE_CHECK:buyer:Mobile");
    expect(nextReuseCheck("buyer", copied, "Mobile")).toBeNull();
  });
});

describe("detail page shows which request the details came from", () => {
  it("reusedFrom", async () => {
    const { toDetail } = await import("./wa-requests.mapper.js");
    const row: any = { id: "cur-req-000001", organizationId: "o", phone: MINE, customerName: null, status: "SUBMITTED", step: "FINAL", data: { reuse: { buyer: { from: "prev-req-00001", used: true } } }, deed: null, documentKey: null, needsStaff: false, workStatus: "NEW", assigneeId: null, staffNote: null, createdAt: new Date(), updatedAt: new Date() };
    expect(toDetail(row, null, true).reusedFrom).toEqual(["-00001"]);
    row.data.reuse.buyer = { from: "prev-req-00001", declined: true };
    expect(toDetail(row, null, true).reusedFrom).toEqual([]);
  });
});
