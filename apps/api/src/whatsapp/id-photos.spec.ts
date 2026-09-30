import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftIntakeService, idNext } from "./draft-intake.service.js";
import { idWarningsFor, mapIdRead, normDob } from "./id-cards.js";
import { IdPhotoRetentionService, idPhotoKeys, purgedData, retentionDays } from "./id-photo-retention.service.js";
import { validAadhaar } from "./intake-rules.js";
import { decrypt } from "./pii-crypto.js";
import { type DraftIntakeRow, idCards, idPhotoKeyAt, toDetail } from "./wa-requests.mapper.js";
import { closedAtFor, WaRequestsService } from "./wa-requests.service.js";

const KEY = "b".repeat(64); // test-only key
/** A Verhoeff-valid test Aadhaar (not a real person's). */
const aadhaar = (base11: string) => {
  for (let d = 0; d <= 9; d++) if (validAadhaar(base11 + d)) return base11 + d;
  throw new Error("no check digit");
};
const AADHAAR = aadhaar("23456789012");
const BAD_AADHAAR = AADHAAR.slice(0, 11) + String((Number(AADHAAR[11]) + 1) % 10); // Verhoeff fails
const PAN = "ABCPS1234K";

let logged: string[] = [];
beforeEach(() => {
  vi.stubEnv("DATA_ENC_KEY", KEY);
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(`${level}: ${String(m)}`);
    }) as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("mapIdRead: card JSON → checked values", () => {
  it("Aadhaar front: number must pass Verhoeff; name, DOB and gender normalised", () => {
    const r = mapIdRead("aadhaarFront", { readable: true, cardType: "aadhaar_front", nameEn: "Amit Sharma", nameHi: "अमित शर्मा", dob: "5-8-1985", gender: "M", aadhaarNumber: AADHAAR.replace(/(\d{4})/g, "$1 ") });
    expect(r).toEqual({ ok: true, value: { aadhaar: AADHAAR, name: "अमित शर्मा", nameEn: "Amit Sharma", dob: "05/08/1985", gender: "पुरुष", address: null } });
    expect(mapIdRead("aadhaarFront", { cardType: "aadhaar_front", nameEn: "Amit", aadhaarNumber: BAD_AADHAAR })).toEqual({ ok: false, reason: "unreadable" });
    expect(mapIdRead("aadhaarFront", { cardType: "aadhaar_front", nameEn: "Amit", aadhaarNumber: "XXXX XXXX 1234" })).toEqual({ ok: false, reason: "unreadable" });
    expect(mapIdRead("aadhaarFront", { readable: false, aadhaarNumber: AADHAAR, nameEn: "Amit" })).toEqual({ ok: false, reason: "unreadable" });
    expect(mapIdRead("aadhaarFront", { cardType: "pan", panNumber: PAN, nameEn: "AMIT" })).toEqual({ ok: false, reason: "wrongCard" });
    expect(mapIdRead("aadhaarFront", null)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("Aadhaar back: needs the address", () => {
    expect(mapIdRead("aadhaarBack", { cardType: "aadhaar_back", address: "मकान 12, लश्कर, ग्वालियर 474001" })).toEqual({
      ok: true,
      value: { address: "मकान 12, लश्कर, ग्वालियर 474001", aadhaar: null },
    });
    expect(mapIdRead("aadhaarBack", { cardType: "aadhaar_back", address: "" })).toEqual({ ok: false, reason: "unreadable" });
  });

  it("PAN: number pattern, name and father", () => {
    expect(mapIdRead("pan", { cardType: "pan", panNumber: "abcps 1234k", nameEn: "AMIT SHARMA", fatherNameEn: "RAJESH KUMAR SHARMA", dob: "1985-08-05" })).toEqual({
      ok: true,
      value: { pan: PAN, nameEn: "AMIT SHARMA", fatherEn: "RAJESH KUMAR SHARMA", dob: "05/08/1985" },
    });
    expect(mapIdRead("pan", { cardType: "pan", panNumber: "ABCPS12345", nameEn: "AMIT" })).toEqual({ ok: false, reason: "unreadable" });
    expect(mapIdRead("pan", { cardType: "aadhaar_front", aadhaarNumber: AADHAAR, nameEn: "AMIT" })).toEqual({ ok: false, reason: "wrongCard" });
  });

  it("DOB: full date or the year alone, never a guess", () => {
    expect(normDob("१५/०८/१९८५")).toBe("15/08/1985");
    expect(normDob("1985")).toBe("1985");
    expect(normDob("August 1985")).toBeNull();
  });
});

describe("cross-check → staff check", () => {
  it("Aadhaar vs PAN name, PAN father vs typed father (not for पत्नी)", () => {
    const read = { aadhaarName: "अमित शर्मा", aadhaarNameEn: "Amit Sharma", panName: "AMIT SHARMA", panFather: "RAJESH KUMAR SHARMA" };
    expect(idWarningsFor(read, { fatherName: "राजेश कुमार शर्मा", relation: "पुत्र" })).toEqual([]);
    expect(idWarningsFor({ ...read, panName: "SUMIT VERMA" }, { fatherName: "राजेश कुमार शर्मा", relation: "पुत्र" })).toEqual(["aadhaarPanName"]);
    expect(idWarningsFor(read, { fatherName: "महेश वर्मा", relation: "पुत्र" })).toEqual(["panFather"]);
    expect(idWarningsFor(read, { fatherName: "महेश वर्मा", relation: "पत्नी" })).toEqual([]); // husband's name is not on the PAN
    expect(idWarningsFor({ unreadable: true }, {})).toEqual(["unreadable"]);
    expect(idWarningsFor(undefined, {})).toEqual([]);
  });
});

describe("bot: ID photos before the buyer's typed questions", () => {
  const readerReturns: unknown[] = [];
  function convo() {
    const cur: any = { id: "cmg1abcdefxyz123", step: "CONFIRM_PROPERTY", status: "ACTIVE", data: {}, deed: null, needsStaff: false };
    const prisma = {
      draftIntake: {
        findFirst: vi.fn(async () => (cur.status === "ACTIVE" ? cur : null)),
        update: vi.fn(async ({ data }: any) => Object.assign(cur, data)),
      },
    };
    const reader = { read: vi.fn(async () => readerReturns.shift() ?? null) };
    const svc = new DraftIntakeService(prisma as any, {} as any, { lookup: vi.fn(async () => null) } as any, reader as any);
    const ctx = { phone: "919876543210", name: "अ" };
    let n = 0;
    return {
      cur,
      reader,
      say: async (t: string) => (await svc.handleText(ctx, t))!.join("\n"),
      photo: async () => (await svc.handleDocument(ctx, { key: `whatsapp/org-1/id${++n}.jpg`, buf: Buffer.from("img"), mime: "image/jpeg" })).join("\n"),
    };
  }
  const front = { readable: true, cardType: "aadhaar_front", nameEn: "Amit Sharma", nameHi: "अमित शर्मा", dob: "05/08/1985", gender: "M", aadhaarNumber: AADHAAR };
  const back = { readable: true, cardType: "aadhaar_back", address: "मकान 12, लश्कर, ग्वालियर 474001" };
  const pan = { readable: true, cardType: "pan", panNumber: PAN, nameEn: "AMIT SHARMA", fatherNameEn: "RAJESH KUMAR SHARMA", dob: "05/08/1985" };

  it("asks the photos with the one-time notice, confirms masked, fills on हाँ, then asks only what is left", async () => {
    const c = convo();
    const first = await c.say("हाँ");
    expect(first).toContain("आपके दस्तावेज़ सिर्फ़ रजिस्ट्री के काम के लिए रखे जाएंगे और काम पूरा होने के बाद हटा दिए जाएंगे");
    expect(first).toContain("आधार कार्ड के आगे वाले हिस्से");
    expect(c.cur.step).toBe("ID_PHOTO:buyer:aadhaarFront");

    readerReturns.push(front, back);
    expect(await c.photo()).toContain("आधार कार्ड के पीछे");
    const confirm = await c.photo();
    expect(confirm).toContain(`आधार: XXXX XXXX ${AADHAAR.slice(-4)}`);
    expect(confirm).not.toContain(AADHAAR);
    expect(confirm).toContain("नाम: अमित शर्मा");
    expect(confirm).toContain("पता: मकान 12");
    expect(c.cur.step).toBe("ID_OK:buyer:aadhaar");

    const afterYes = await c.say("हाँ");
    expect(afterYes).toContain("PAN कार्ड की साफ़ फ़ोटो");
    expect(afterYes).not.toContain("रजिस्ट्री के काम के लिए रखे जाएंगे"); // notice only once
    expect(c.cur.data.buyerName).toBe("अमित शर्मा");
    expect(decrypt(c.cur.data.buyerAadhaar)).toBe(AADHAAR);
    expect(c.cur.data.buyerAddress).toContain("लश्कर");

    readerReturns.push(pan);
    const panConfirm = await c.photo();
    expect(panConfirm).toContain("पिता का नाम: RAJESH KUMAR SHARMA");
    expect(panConfirm).toContain("PAN: XXXX234K");
    expect(panConfirm).not.toContain(PAN);
    expect(await c.say("हाँ")).toContain("पासपोर्ट साइज़ फ़ोटो");
    expect(decrypt(c.cur.data.buyerPan)).toBe(PAN);

    // Passport photo is stored, not read; then the first typed question left is the relation.
    const next = await c.photo();
    expect(c.reader.read).toHaveBeenCalledTimes(3);
    expect(next).toContain("संबंध चुनें");
    expect(c.cur.step).toBe("buyerRelation");
    expect(c.cur.data.idPhotos.buyer).toEqual({
      aadhaarFront: "whatsapp/org-1/id1.jpg",
      aadhaarBack: "whatsapp/org-1/id2.jpg",
      pan: "whatsapp/org-1/id3.jpg",
      passportPhoto: "whatsapp/org-1/id4.jpg",
    });
    // Aadhaar and address come from the card: not asked again.
    await c.say("1");
    await c.say("राजेश कुमार शर्मा");
    await c.say("सीता देवी");
    expect(c.cur.step).toBe("buyerMobile");
    expect(logged.join("\n")).not.toContain(AADHAAR);
    expect(logged.join("\n")).not.toContain(PAN);
  });

  it("बदलें leaves the fields to be typed", async () => {
    const c = convo();
    await c.say("हाँ");
    readerReturns.push(front, back);
    await c.photo();
    await c.photo();
    await c.say("बदलें");
    expect(c.cur.data.buyerName).toBeUndefined();
    expect(c.cur.data.buyerAadhaar).toBeUndefined();
    expect(c.cur.step).toBe("ID_PHOTO:buyer:pan");
  });

  it("a blurry photo is asked again; after two failures the details are typed and the request gets स्टाफ जाँच", async () => {
    const c = convo();
    await c.say("हाँ");
    readerReturns.push({ readable: false }, { readable: true, cardType: "aadhaar_front", nameEn: "Amit", aadhaarNumber: BAD_AADHAAR });
    expect(await c.photo()).toContain("साफ़ नहीं पढ़ी जा सकी");
    expect(c.cur.step).toBe("ID_PHOTO:buyer:aadhaarFront");
    const gaveUp = await c.photo();
    expect(gaveUp).toContain("लिखकर भेज दें");
    expect(c.cur.needsStaff).toBe(true);
    expect(c.cur.step).toBe("ID_PHOTO:buyer:aadhaarBack");
    expect(c.cur.data.idRead.buyer.unreadable).toBe(true);
    expect(c.cur.data.idFiles).toEqual(["whatsapp/org-1/id1.jpg", "whatsapp/org-1/id2.jpg"]); // both deleted on retention
  });

  it('"बाद में" skips a photo (staff check); text instead of a photo asks again', async () => {
    const c = convo();
    await c.say("हाँ");
    expect(await c.say("अमित")).toContain("फ़ोटो भेजें");
    await c.say("बाद में");
    expect(c.cur.data.idPhotos.buyer.aadhaarFront).toBe("later");
    expect(c.cur.needsStaff).toBe(true);
    expect(c.cur.step).toBe("ID_PHOTO:buyer:aadhaarBack");
  });

  it("idNext walks the configured photos, then the confirmations", () => {
    expect(idNext("buyer", {})).toBe("ID_PHOTO:buyer:aadhaarFront");
    expect(idNext("buyer", { idPhotos: { buyer: { aadhaarFront: "k", aadhaarBack: "k" } }, idPending: { buyer: { aadhaar: {} } } })).toBe("ID_OK:buyer:aadhaar");
    const done = { idPhotos: { buyer: { aadhaarFront: "k", aadhaarBack: "later", pan: "k", passportPhoto: "k" } }, idPending: { buyer: { aadhaar: {}, aadhaarOk: true, pan: {}, panOk: false } } };
    expect(idNext("buyer", done)).toBeNull();
  });

  it("submit with an Aadhaar/PAN name mismatch → स्टाफ जाँच", async () => {
    const data = {
      buyerName: "अमित", buyerRelation: "पुत्र", buyerFatherName: "राजेश", buyerMotherName: "सीता", buyerAadhaar: "enc:x",
      buyerMobile: "9876543210", buyerEmail: "a@b.com", buyerAddress: "लश्कर, ग्वालियर",
      idRead: { buyer: { aadhaarNameEn: "Amit Sharma", panName: "SUMIT VERMA" } },
    };
    const cur = { id: "cmg1abcdefxyz123", step: "FINAL", status: "ACTIVE", data, needsStaff: false };
    const update = vi.fn(async () => ({}));
    const svc = new DraftIntakeService({ draftIntake: { findFirst: vi.fn(async () => cur), update } } as any, {} as any, {} as any, {} as any);
    await svc.handleText({ phone: "1", name: "" }, "हाँ");
    expect(update).toHaveBeenCalledWith({ where: { id: cur.id }, data: { status: "SUBMITTED", workStatus: "NEW", needsStaff: true } });
  });
});

function row(over: Partial<DraftIntakeRow> = {}): DraftIntakeRow {
  return {
    id: "cmg1abcdefxyz123",
    organizationId: "org-1",
    phone: "919876543210",
    customerName: "अ",
    status: "SUBMITTED",
    step: "FINAL",
    data: {
      buyerName: "अमित शर्मा",
      buyerRelation: "पुत्र",
      buyerFatherName: "महेश वर्मा",
      idPhotos: { buyer: { aadhaarFront: "whatsapp/org-1/a1.jpg", aadhaarBack: "later", pan: "whatsapp/org-1/p1.jpg" } },
      idFiles: ["whatsapp/org-1/a0.jpg", "whatsapp/org-1/a1.jpg", "whatsapp/org-1/p1.jpg"],
      idPending: { buyer: { aadhaarOk: true, panOk: true } },
      idRead: { buyer: { aadhaarName: "अमित शर्मा", aadhaarNameEn: "Amit Sharma", panName: "AMIT SHARMA", panFather: "RAJESH KUMAR SHARMA" } },
    },
    deed: null,
    documentKey: null,
    needsStaff: true,
    workStatus: "IN_PROGRESS",
    assigneeId: "emp-1",
    staffNote: null,
    createdAt: new Date("2026-09-29T10:00:00Z"),
    updatedAt: new Date("2026-09-29T10:05:00Z"),
    ...over,
  };
}

describe("detail page: ID photos and warnings", () => {
  it("lists photo states and the PAN-father warning", () => {
    const cards = idCards(row().data as any);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ party: "buyer", heading: "खरीदार", aadhaarFromCard: true, panFromCard: true });
    expect(cards[0]!.photos.map((p) => `${p.kind}:${p.state}`)).toEqual(["aadhaarFront:received", "aadhaarBack:later", "pan:received", "passportPhoto:null"]);
    expect(cards[0]!.warnings).toEqual(["PAN कार्ड पर पिता का नाम ग्राहक के लिखे नाम से अलग है"]);
    const d = toDetail(row(), null, true);
    expect(d.idCards).toHaveLength(1);
    expect(JSON.stringify(d)).not.toContain("whatsapp/org-1/"); // storage keys never leave the API
  });

  it("idPhotoKeyAt only returns stored keys for known parties/kinds", () => {
    expect(idPhotoKeyAt(row(), "buyer", "aadhaarFront")).toBe("whatsapp/org-1/a1.jpg");
    expect(idPhotoKeyAt(row(), "buyer", "aadhaarBack")).toBeNull(); // "later"
    expect(idPhotoKeyAt(row(), "buyer", "passportPhoto")).toBeNull();
    expect(idPhotoKeyAt(row(), "seller", "pan")).toBeNull();
    expect(idPhotoKeyAt(row(), "buyer", "../../etc")).toBeNull();
  });
});

describe("ID photo permissions: OWNER/ADMIN and the request's assignee only", () => {
  const as = (role: string, userId: string) => ({ get: () => ({ userId, organizationId: "org-1", membershipId: "m", role }) });
  const matches = (r: any, where: Record<string, any>) => Object.entries(where).every(([k, v]) => r[k] === v);
  const prismaFor = (rows: DraftIntakeRow[]) => ({
    draftIntake: { findFirst: vi.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null) },
  });

  it("assignee, OWNER and ADMIN see the photo; another employee gets 404; only who/which is logged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wa-id-"));
    try {
      await mkdir(join(dir, "whatsapp"), { recursive: true });
      await writeFile(join(dir, "whatsapp", "a1.jpg"), Buffer.from("JPEG-BYTES"));
      vi.stubEnv("WA_MEDIA_DIR", dir);
      const rows = [row()];
      for (const [role, user] of [["EMPLOYEE", "emp-1"], ["OWNER", "own-1"], ["ADMIN", "adm-1"]] as const) {
        const f = await new WaRequestsService(prismaFor(rows) as any, as(role, user) as any).idPhoto("cmg1abcdefxyz123", "buyer", "aadhaarFront");
        expect(f).toMatchObject({ mimeType: "image/jpeg", fileName: "whatsapp-XYZ123-buyer-aadhaarFront.jpg" });
        expect(f.data.toString()).toBe("JPEG-BYTES");
      }
      await expect(
        new WaRequestsService(prismaFor(rows) as any, as("EMPLOYEE", "emp-2") as any).idPhoto("cmg1abcdefxyz123", "buyer", "aadhaarFront"),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        new WaRequestsService(prismaFor(rows) as any, as("OWNER", "own-1") as any).idPhoto("cmg1abcdefxyz123", "buyer", "aadhaarBack"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(logged).toContain("log: request XYZ123 (cmg1abcdefxyz123): ID photo buyer/aadhaarFront viewed by user emp-1 role=EMPLOYEE");
      expect(logged.join("\n")).not.toContain("JPEG-BYTES");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("retention: ID photos deleted N days after DONE/REJECTED", () => {
  it("retention days: env, default 90", () => {
    expect(retentionDays(undefined)).toBe(90);
    expect(retentionDays("30")).toBe(30);
    expect(retentionDays("abc")).toBe(90);
    expect(retentionDays("-5")).toBe(90);
  });

  it("closedAt is set on DONE/REJECTED, kept while closed, cleared on reopen", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const earlier = new Date("2026-09-01T00:00:00Z");
    expect(closedAtFor({ workStatus: "IN_PROGRESS" }, "DONE", now)).toEqual(now);
    expect(closedAtFor({ workStatus: "DONE", closedAt: earlier }, "REJECTED", now)).toEqual(earlier);
    expect(closedAtFor({ workStatus: "DONE", closedAt: earlier }, "IN_PROGRESS", now)).toBeNull();
  });

  it("keys and purged data", () => {
    const d = row().data as any;
    expect(idPhotoKeys(d).sort()).toEqual(["whatsapp/org-1/a0.jpg", "whatsapp/org-1/a1.jpg", "whatsapp/org-1/p1.jpg"]);
    const p = purgedData(d);
    expect(p.idPhotos.buyer).toEqual({ aadhaarFront: "deleted", aadhaarBack: "later", pan: "deleted" });
    expect(p.idFiles).toBeUndefined();
    expect(p.idPending).toBeUndefined();
    expect(p.buyerName).toBe("अमित शर्मा");
  });

  it("purge deletes the files of due requests only and marks them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wa-ret-"));
    try {
      await mkdir(join(dir, "whatsapp"), { recursive: true });
      for (const f of ["a0.jpg", "a1.jpg", "p1.jpg"]) await writeFile(join(dir, "whatsapp", f), "x");
      vi.stubEnv("WA_MEDIA_DIR", dir);
      vi.stubEnv("WA_ID_PHOTO_RETENTION_DAYS", "90");
      const now = new Date("2026-12-31T00:00:00Z");
      const due = row({ workStatus: "DONE", closedAt: new Date("2026-10-01T00:00:00Z") }); // 91 days
      const findMany = vi.fn(async ({ where }: any) => {
        expect(where.closedAt.lte).toEqual(new Date("2026-10-02T00:00:00Z"));
        expect(where.idPhotosPurgedAt).toBeNull();
        return [{ id: due.id, data: due.data }];
      });
      const update = vi.fn(async () => ({}));
      const n = await new IdPhotoRetentionService({ draftIntake: { findMany, update } } as any).purge(now);
      expect(n).toBe(1);
      for (const f of ["a0.jpg", "a1.jpg", "p1.jpg"]) await expect(stat(join(dir, "whatsapp", f))).rejects.toThrow();
      const saved = (update.mock.calls[0] as any)[0];
      expect(saved.data.idPhotosPurgedAt).toEqual(now);
      expect(saved.data.data.idPhotos.buyer.aadhaarFront).toBe("deleted");
      expect(logged).toContain("log: request XYZ123: 3 ID photos deleted (retention)");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
