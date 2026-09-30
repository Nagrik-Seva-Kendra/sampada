import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { WaRequestUpdateInput } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftIntakeService } from "./draft-intake.service.js";
import { validAadhaar } from "./intake-rules.js";
import { encrypt } from "./pii-crypto.js";
import {
  documentKeyAt,
  type DraftIntakeRow,
  localMediaPath,
  maskSecret,
  mimeForKey,
  propertySummary,
  revealSecrets,
  toDetail,
  toListItem,
} from "./wa-requests.mapper.js";
import { WaRequestsService } from "./wa-requests.service.js";

const KEY = "a".repeat(64); // test-only key
const AADHAAR = "234567890124";
const PAN = "ABCDE1234F";

function row(over: Partial<DraftIntakeRow> = {}): DraftIntakeRow {
  return {
    id: "cmg1abcdefxyz123",
    organizationId: "org-1",
    phone: "919876543210",
    customerName: "राम",
    status: "SUBMITTED",
    step: "FINAL",
    data: {
      buyerName: "श्याम लाल",
      buyerFatherName: "मोहन लाल",
      buyerMotherName: "सीता",
      buyerAadhaar: encrypt(AADHAAR),
      buyerMobile: "9876543210",
      buyerEmail: "a@b.com",
      buyerAddress: "वार्ड 12, ग्वालियर",
      buyerPan: encrypt(PAN),
      amount: 1_500_000,
      amountMode: "CUSTOM",
      tax: { panRequired: false, sftReported: false, tdsApplies: false },
      extraDocs: ["whatsapp/org-1/m2.jpeg"],
    },
    deed: {
      isSaleDeed: true,
      documentType: "विक्रय पत्र",
      registrationNo: "MP123/2019",
      registrationDate: "12/03/2019",
      sellers: [{ name: "पुराना विक्रेता", relation: null }],
      buyers: [{ name: "वर्तमान मालिक", relation: "पुत्र" }],
      property: {
        district: "ग्वालियर",
        tehsil: null,
        village: "सिरोल",
        locality: null,
        khasraOrPlotNo: "45/2",
        propertyType: "residential_plot",
        areaValue: 150,
        areaUnit: "वर्ग मीटर",
      },
      consideration: 900000,
    },
    documentKey: "whatsapp/org-1/m1.pdf",
    needsStaff: false,
    workStatus: "NEW",
    assigneeId: null,
    staffNote: null,
    createdAt: new Date("2026-09-29T10:00:00Z"),
    updatedAt: new Date("2026-09-29T10:05:00Z"),
    ...over,
  };
}

let logged: string[] = [];
beforeEach(() => {
  vi.stubEnv("DATA_ENC_KEY", KEY);
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    const capture = (m: unknown) => {
      logged.push(`${level}: ${String(m)}`);
    };
    vi.spyOn(Logger.prototype, level).mockImplementation(capture as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("mapper", () => {
  it("list item: ref, masked phone, buyer, amount, property summary", () => {
    const item = toListItem(row(), "अनुज शर्मा");
    expect(item).toMatchObject({
      ref: "XYZ123",
      phoneMasked: "********3210",
      buyerName: "श्याम लाल",
      amount: 1_500_000,
      amountMode: "CUSTOM",
      workStatus: "NEW",
      propertySummary: "सिरोल, ग्वालियर · खसरा/प्लॉट 45/2",
      assigneeName: "अनुज शर्मा",
    });
    expect(JSON.stringify(item)).not.toContain(AADHAAR);
  });

  it("detail masks Aadhaar/PAN and maps the registry", () => {
    const d = toDetail(row(), null, false);
    expect(d.buyer.aadhaarMasked).toBe("XXXX0124");
    expect(d.buyer.panMasked).toBe("XXXX234F");
    expect(d.sellerPanMasked).toBeNull();
    expect(d.registry?.currentOwners).toEqual([{ name: "वर्तमान मालिक", relation: "पुत्र" }]);
    expect(d.registry?.registrationNo).toBe("MP123/2019");
    expect(d.documents).toEqual([
      { index: 0, label: "पुरानी रजिस्ट्री" },
      { index: 1, label: "अतिरिक्त दस्तावेज़ 1" },
    ]);
    expect(d.canReveal).toBe(false);
    const json = JSON.stringify(d);
    expect(json).not.toContain(AADHAAR);
    expect(json).not.toContain(PAN);
    expect(json).not.toContain("enc:");
  });

  it("maskSecret never leaks ciphertext when the key is wrong", () => {
    const stored = encrypt(AADHAAR);
    vi.stubEnv("DATA_ENC_KEY", "b".repeat(64));
    expect(maskSecret(stored)).toBe("XXXX????");
    expect(maskSecret(undefined)).toBeNull();
  });

  it("tolerates empty data/deed", () => {
    const d = toDetail(row({ data: {}, deed: null, documentKey: null, workStatus: null, status: "ACTIVE" }), null, true);
    expect(d.registry).toBeNull();
    expect(d.documents).toEqual([]);
    expect(d.buyer.aadhaarMasked).toBeNull();
    expect(propertySummary(null)).toBeNull();
  });

  it("document keys come only from the row, and local paths cannot escape the media dir", () => {
    const r = row();
    expect(documentKeyAt(r, 0)).toBe("whatsapp/org-1/m1.pdf");
    expect(documentKeyAt(r, 1)).toBe("whatsapp/org-1/m2.jpeg");
    expect(documentKeyAt(r, 2)).toBeNull();
    expect(documentKeyAt(r, -1)).toBeNull();
    expect(documentKeyAt(r, 0.5)).toBeNull();
    expect(localMediaPath("whatsapp/org-1/m1.pdf", "/data/uploads")).toBe("/data/uploads/whatsapp/m1.pdf");
    expect(localMediaPath("whatsapp/org-1/../../../etc/passwd", "/data/uploads")).toBeNull();
    expect(mimeForKey("a/b.PDF")).toBe("application/pdf");
    expect(mimeForKey("a/b.jpeg")).toBe("image/jpeg");
    expect(mimeForKey("a/b")).toBe("application/octet-stream");
  });

  it("update input only accepts known workflow fields", () => {
    expect(WaRequestUpdateInput.parse({ workStatus: "DONE", assigneeId: null, staffNote: "ok" })).toEqual({
      workStatus: "DONE",
      assigneeId: null,
      staffNote: "ok",
    });
    expect(() => WaRequestUpdateInput.parse({ workStatus: "WHATEVER" })).toThrow();
    expect(() => WaRequestUpdateInput.parse({ organizationId: "org-2" })).toThrow();
  });
});

describe("WaRequestsService", () => {
  const tenant = (role: string, organizationId = "org-1", userId = "user-7") => ({
    get: () => ({ userId, organizationId, membershipId: "m-7", role }),
  });

  /** Minimal Prisma `where` evaluator: equality and `{ in: [...] }` on top-level fields. */
  const matches = (r: any, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && Array.isArray(v.in) ? v.in.includes(r[k]) : r[k] === v,
    );

  function fakePrisma(rows: DraftIntakeRow[]) {
    return {
      draftIntake: {
        findMany: vi.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
        findFirst: vi.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
        count: vi.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const r = rows.find((x) => matches(x, where));
          if (r) Object.assign(r, data);
          return { count: r ? 1 : 0 };
        }),
      },
      membership: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.organizationId === "org-1" && where.userId === "user-9" && where.status === "ACTIVE" ? { id: "m-9" } : null,
        ),
        findMany: vi.fn(async () => [{ user: { id: "user-9", fname: "सुनील", lname: "वर्मा" } }]),
      },
      user: { findMany: vi.fn(async () => [{ id: "user-9", fname: "सुनील", lname: "वर्मा" }]) },
    };
  }

  it("lists only the caller's organization, with the NEW count", async () => {
    const prisma = fakePrisma([row(), row({ id: "other-org-req", organizationId: "org-2" })]);
    const res = await new WaRequestsService(prisma as any, tenant("OWNER") as any).list({});
    expect(res.data.map((r) => r.id)).toEqual(["cmg1abcdefxyz123"]);
    expect(res.newCount).toBe(1);
    expect(prisma.draftIntake.findMany.mock.calls[0]![0].where.organizationId).toBe("org-1");
  });

  it("another organization's request is not found", async () => {
    const svc = new WaRequestsService(fakePrisma([row()]) as any, tenant("OWNER", "org-2") as any);
    await expect(svc.detail("cmg1abcdefxyz123")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reveal("cmg1abcdefxyz123")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reveal: EMPLOYEE is refused; OWNER/ADMIN get values, and only who/which is logged", async () => {
    const prisma = fakePrisma([row()]);
    await expect(new WaRequestsService(prisma as any, tenant("EMPLOYEE") as any).reveal("cmg1abcdefxyz123")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    for (const role of ["OWNER", "ADMIN"]) {
      const out = await new WaRequestsService(prisma as any, tenant(role) as any).reveal("cmg1abcdefxyz123");
      expect(out).toEqual({ aadhaar: AADHAAR, pan: PAN, sellerPan: null, people: [] });
    }
    expect(logged).toContain("log: request XYZ123 (cmg1abcdefxyz123): Aadhaar/PAN revealed by user user-7 role=OWNER");
    const all = logged.join("\n");
    expect(all).not.toContain(AADHAAR);
    expect(all).not.toContain(PAN);
  });

  it("detail says who may reveal", async () => {
    const prisma = fakePrisma([row({ assigneeId: "user-7" })]); // assigned to the employee below
    expect((await new WaRequestsService(prisma as any, tenant("ADMIN") as any).detail("cmg1abcdefxyz123")).canReveal).toBe(true);
    expect((await new WaRequestsService(prisma as any, tenant("EMPLOYEE") as any).detail("cmg1abcdefxyz123")).canReveal).toBe(false);
  });

  it("update: sets workflow fields, rejects non-members as assignee", async () => {
    const rows = [row()];
    const svc = new WaRequestsService(fakePrisma(rows) as any, tenant("OWNER") as any);
    const d = await svc.update("cmg1abcdefxyz123", { workStatus: "IN_PROGRESS", assigneeId: "user-9", staffNote: "  कल फ़ोन करें  " });
    expect(d).toMatchObject({ workStatus: "IN_PROGRESS", assigneeId: "user-9", staffNote: "कल फ़ोन करें", assigneeName: "सुनील वर्मा" });
    await expect(svc.update("cmg1abcdefxyz123", { assigneeId: "user-from-other-org" })).rejects.toThrow("सक्रिय सदस्य नहीं");
  });

  it("document streams the file from the local media dir when R2 is not configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wa-media-"));
    try {
      await mkdir(join(dir, "whatsapp"), { recursive: true });
      await writeFile(join(dir, "whatsapp", "m1.pdf"), Buffer.from("%PDF-test"));
      vi.stubEnv("WA_MEDIA_DIR", dir);
      const svc = new WaRequestsService(fakePrisma([row()]) as any, tenant("OWNER") as any);
      const f = await svc.document("cmg1abcdefxyz123", 0);
      expect(f).toMatchObject({ mimeType: "application/pdf", fileName: "whatsapp-XYZ123-registry.pdf" });
      expect(f.data.toString()).toBe("%PDF-test");
      await expect(svc.document("cmg1abcdefxyz123", 1)).rejects.toBeInstanceOf(NotFoundException); // file missing on disk
      await expect(svc.document("cmg1abcdefxyz123", 5)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("WaRequestsService access control (employee sees only assigned requests)", () => {
  const as = (role: string, userId: string) => ({ get: () => ({ userId, organizationId: "org-1", membershipId: "m", role }) });
  const matches = (r: any, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && Array.isArray(v.in) ? v.in.includes(r[k]) : r[k] === v,
    );
  const prismaFor = (rows: DraftIntakeRow[]) => ({
    draftIntake: {
      findMany: vi.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
      findFirst: vi.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
      count: vi.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const r = rows.find((x) => matches(x, where));
        if (r) Object.assign(r, data);
        return { count: r ? 1 : 0 };
      }),
    },
    membership: { findFirst: vi.fn(async () => ({ id: "m-9" })), findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => [{ id: "emp-1", fname: "सुनील", lname: "वर्मा" }]) },
  });
  // mine: assigned to emp-1; theirs: assigned to emp-2; unassigned: nobody.
  const data = () => [
    row({ id: "req-mine-00001", assigneeId: "emp-1", workStatus: "IN_PROGRESS" }),
    row({ id: "req-theirs-0002", assigneeId: "emp-2", workStatus: "NEW" }),
    row({ id: "req-unasgn-0003", assigneeId: null, workStatus: "NEW" }),
  ];

  it("employee: list and badge only include their own assigned requests", async () => {
    const svc = new WaRequestsService(prismaFor(data()) as any, as("EMPLOYEE", "emp-1") as any);
    const res = await svc.list({});
    expect(res.data.map((r) => r.id)).toEqual(["req-mine-00001"]);
    expect(res.newCount).toBe(1); // own NEW + IN_PROGRESS
    expect(await svc.summary()).toEqual({ newCount: 1, canManage: false, visible: true });
  });

  it("employee with nothing assigned: sidebar item hidden", async () => {
    const svc = new WaRequestsService(prismaFor(data()) as any, as("EMPLOYEE", "emp-3") as any);
    expect(await svc.summary()).toEqual({ newCount: 0, canManage: false, visible: false });
    expect((await svc.list({})).data).toEqual([]);
  });

  it("employee: unassigned or someone else's request is 404 for detail, document, update", async () => {
    const svc = new WaRequestsService(prismaFor(data()) as any, as("EMPLOYEE", "emp-1") as any);
    for (const id of ["req-theirs-0002", "req-unasgn-0003"]) {
      await expect(svc.detail(id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.document(id, 0)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.update(id, { workStatus: "DONE" })).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("employee: sees their own request, may change status and note, but not the assignee", async () => {
    const rows = data();
    const svc = new WaRequestsService(prismaFor(rows) as any, as("EMPLOYEE", "emp-1") as any);
    const d = await svc.detail("req-mine-00001");
    expect(d).toMatchObject({ id: "req-mine-00001", canReveal: false, canAssign: false });
    const u = await svc.update("req-mine-00001", { workStatus: "DRAFT_READY", staffNote: "ड्राफ्ट बन गया" });
    expect(u).toMatchObject({ workStatus: "DRAFT_READY", staffNote: "ड्राफ्ट बन गया" });
    await expect(svc.update("req-mine-00001", { assigneeId: "emp-2" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.update("req-mine-00001", { assigneeId: null })).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows[0]!.assigneeId).toBe("emp-1");
  });

  it("employee: reveal and the assignee list are 403, even on their own request", async () => {
    const svc = new WaRequestsService(prismaFor(data()) as any, as("EMPLOYEE", "emp-1") as any);
    await expect(svc.reveal("req-mine-00001")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assignees()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("owner/admin: see every request, can assign and reveal", async () => {
    for (const role of ["OWNER", "ADMIN"]) {
      const rows = data();
      const svc = new WaRequestsService(prismaFor(rows) as any, as(role, "boss") as any);
      expect((await svc.list({})).data).toHaveLength(3);
      expect(await svc.summary()).toEqual({ newCount: 2, canManage: true, visible: true });
      expect((await svc.detail("req-unasgn-0003")).canAssign).toBe(true);
      await svc.update("req-unasgn-0003", { assigneeId: "emp-1" });
      expect(rows[2]!.assigneeId).toBe("emp-1");
      await expect(svc.reveal("req-theirs-0002")).resolves.toMatchObject({ aadhaar: AADHAAR });
    }
  });
});

describe("DraftIntakeService plot questions", () => {
  const plotDeed = {
    isSaleDeed: true,
    buyers: [{ name: "वर्तमान मालिक", relation: null }],
    sellers: [],
    property: { district: "ग्वालियर", propertyType: "residential_plot", areaValue: 1500, areaUnit: "वर्ग फुट" },
  };
  /** In-memory conversation: one DraftIntake row the service reads and updates. */
  function conversation(deed: unknown) {
    const cur: any = { id: "cmg1abcdefxyz123", step: "CONFIRM_PROPERTY", status: "ACTIVE", data: {}, deed, needsStaff: false };
    const prisma = {
      draftIntake: {
        findFirst: vi.fn(async () => cur),
        update: vi.fn(async ({ data }: any) => Object.assign(cur, data)),
      },
    };
    const lookup = vi.fn(async () => null);
    const svc = new DraftIntakeService(prisma as any, {} as any, { lookup } as any);
    const say = (text: string) => svc.handleText({ phone: "919876543210", name: "राम" }, text);
    return { cur, say, lookup };
  }

  it("asks house → corner → boundary for a plot, then the buyer's name", async () => {
    const c = conversation(plotDeed);
    expect((await c.say("हाँ"))!.join()).toContain("मकान या कोई निर्माण");
    expect((await c.say("नहीं"))!.join()).toContain("कॉर्नर प्लॉट");
    expect((await c.say("हाँ"))!.join()).toContain("बाउंड्री वॉल");
    expect((await c.say("पता नहीं"))!.join()).toContain("खरीदार (क्रेता) का पूरा नाम");
    expect(c.cur.data).toMatchObject({ plotHasBuilding: false, plotCorner: true, plotBoundary: null });
    expect(c.cur.needsStaff).toBe(false);
  });

  it("re-asks on an unclear answer", async () => {
    const c = conversation(plotDeed);
    await c.say("हाँ");
    expect((await c.say("शायद"))!.join()).toContain("पता नहीं");
    expect(c.cur.step).toBe("PLOT_BUILDING");
  });

  it("a house on the plot (or not knowing) flags the request for staff", async () => {
    for (const answer of ["हाँ", "पता नहीं"]) {
      const c = conversation(plotDeed);
      await c.say("हाँ");
      const reply = await c.say(answer);
      expect(reply![0]).toContain("स्टाफ निर्माण का विवरण");
      expect(reply![1]).toContain("कॉर्नर प्लॉट");
      expect(c.cur.needsStaff).toBe(true);
    }
  });

  it("non-plot deeds skip the plot questions", async () => {
    const c = conversation({ ...plotDeed, property: { ...plotDeed.property, propertyType: "agricultural" } });
    expect((await c.say("हाँ"))!.join()).toContain("खरीदार (क्रेता) का पूरा नाम");
  });

  it("passes the answers to the guideline lookup, shows them in the summary, and keeps them on बदलें", async () => {
    const c = conversation(plotDeed);
    c.cur.step = "AMOUNT";
    c.cur.data = { plotHasBuilding: false, plotCorner: true, plotBoundary: false, buyerName: "श्याम" };
    await c.say("गाइडलाइन");
    expect(c.lookup).toHaveBeenCalledWith(plotDeed.property, { owners: 1, plot: { hasBuilding: false, corner: true } });

    c.cur.step = "FINAL";
    c.cur.data = { plotHasBuilding: false, plotCorner: true, plotBoundary: false, buyerName: "श्याम", amount: 1500000, amountMode: "CUSTOM" };
    const summary = await c.say("कुछ और"); // unclear answer → re-prompt with the options
    expect(summary!.join()).toContain("बदलें");
    await c.say("बदलें");
    expect(c.cur.data).toEqual({ plotHasBuilding: false, plotCorner: true, plotBoundary: false });
    expect(c.cur.step).toBe("buyerName");
  });

  it("final summary lists the plot answers", async () => {
    const c = conversation(plotDeed);
    c.cur.step = "sellerPan"; // last step before FINAL when TDS applies
    c.cur.data = { plotHasBuilding: false, plotCorner: true, plotBoundary: null, tax: { tdsApplies: true, panRequired: true } };
    const reply = await c.say("ABCDE1234F");
    const text = reply!.join("\n");
    expect(text).toContain("प्लॉट पर मकान/निर्माण: नहीं");
    expect(text).toContain("कॉर्नर प्लॉट: हाँ");
    expect(text).toContain("बाउंड्री वॉल: पता नहीं");
  });
});

describe("DraftIntakeService document choice and बंधक पत्र (mortgage) flow", () => {
  /** A Verhoeff-valid test Aadhaar (not a real person's): brute-force the check digit. */
  const aadhaar = (base11: string) => {
    for (let d = 0; d <= 9; d++) if (validAadhaar(base11 + d)) return base11 + d;
    throw new Error("no check digit");
  };
  const sanctionLetter = { isSaleDeed: false, documentType: "बैंक सैंक्शन लेटर", buyers: [], sellers: [], property: null };

  const saleRegistry = {
    isSaleDeed: true,
    documentType: "विक्रय पत्र",
    buyers: [{ name: "स्व. रमेश चंद्र", relation: null }],
    sellers: [],
    property: { district: "ग्वालियर", propertyType: "house" },
  };
  const file = (key: string) => ({ key, buf: Buffer.from("x"), mime: "application/pdf" });

  function conversation(step: string, deed: unknown, data: Record<string, unknown> = {}) {
    const cur: any = { id: "cmg1abcdefxyz123", step, status: "ACTIVE", data, deed, needsStaff: false, documentKey: "wa/first.pdf" };
    const prisma = {
      draftIntake: {
        findFirst: vi.fn(async () => (cur.status === "ACTIVE" ? cur : null)),
        update: vi.fn(async ({ data }: any) => Object.assign(cur, data)),
        create: vi.fn(async ({ data }: any) => Object.assign(cur, data, { status: "ACTIVE" })),
      },
    };
    const extractor = { extract: vi.fn(async (): Promise<unknown> => sanctionLetter) };
    const svc = new DraftIntakeService(prisma as any, extractor as any, { lookup: vi.fn(async () => null) } as any);
    const say = (text: string) => svc.handleText({ phone: "919876543210", name: "अनुज" }, text);
    const send = (key: string) => svc.handleDocument({ phone: "919876543210", name: "अनुज" }, file(key));
    return { cur, say, send, svc, prisma, extractor };
  }

  it("the screenshot case: at 'हाँ/नहीं', \"…बंधक बनाना है\" starts बंधक पत्र and asks for the registry", async () => {
    const c = conversation("CONFIRM_PROPERTY", sanctionLetter);
    const reply = (await c.say("यह बैंक का सैंक्शन लेटर है बंधक बनाना है"))!.join("\n");
    expect(reply).toContain("बंधक पत्र बनाते हैं। इसके लिए ये दस्तावेज़ ज़रूरी हैं");
    expect(reply).toContain("स्टाफ इसी से देख लेगा"); // no bank/loan questions
    expect(reply).toContain("✅ बैंक का सैंक्शन लेटर मिल गया");
    expect(reply).toContain("जिस संपत्ति को बंधक रखना है उसकी रजिस्ट्री");
    expect(c.cur.data).toMatchObject({ deedType: "mortgage", docs: { sanction: "wa/first.pdf" } });
    expect(c.cur.step).toBe("M_REGISTRY");
  });

  it("a non-sale document asks which deed to make; 'नहीं' on a sale deed asks too (no cancel)", async () => {
    const c = conversation("NONE", null);
    c.cur.status = "NONE";
    const out = await c.svc.handleDocument({ phone: "919876543210", name: "अनुज" }, { key: "k", buf: Buffer.from(""), mime: "application/pdf" });
    expect(out[0]).toContain("कौन सा दस्तावेज़ बनवाना है");
    expect(c.cur.step).toBe("CHOOSE_DEED");

    const s = conversation("CONFIRM_PROPERTY", { isSaleDeed: true, property: { propertyType: "flat" }, buyers: [], sellers: [] });
    expect((await s.say("नहीं"))!.join()).toContain("कौन सा दस्तावेज़ बनवाना है");
    expect(s.cur.status).toBe("ACTIVE");
  });

  it("full बंधक पत्र: sanction → registry → owner died → will/mutation → mortgagor + 2 witnesses → summary", async () => {
    const c = conversation("CHOOSE_DEED", sanctionLetter);
    expect((await c.say("2"))!.join()).toContain("रजिस्ट्री");
    c.extractor.extract.mockResolvedValueOnce(saleRegistry);
    const afterRegistry = (await c.send("wa/registry.pdf")).join("\n");
    expect(afterRegistry).toContain("✅ संपत्ति की रजिस्ट्री मिल गई");
    expect(afterRegistry).toContain("रजिस्ट्री के अनुसार संपत्ति के मालिक: स्व. रमेश चंद्र");
    expect(c.cur.deed).toEqual(saleRegistry); // property details now come from the registry
    const transferAsk = (await c.say("नहीं"))!.join();
    expect(transferAsk).toContain("वसीयत, नामांतरण (mutation) आदेश");
    const afterTransfer = (await c.send("wa/vasiyat.pdf")).join("\n");
    expect(afterTransfer).toContain("✅ वसीयत/नामांतरण/उत्तराधिकार का दस्तावेज़ मिल गया");
    expect(afterTransfer).toContain("बंधककर्ता (जो संपत्ति बंधक रख रहे हैं) का पूरा नाम");
    expect(c.cur.data.docs).toEqual({ sanction: "wa/first.pdf", registry: "wa/registry.pdf", transfer: "wa/vasiyat.pdf" });
    // mortgagor: relation menu "1" (पुत्र); witness 1 types the relation inside the name
    // (split → relation + father questions skipped); witness 2 is पत्नी → asked "पति का नाम".
    const people = [
      ["श्री राम प्रसाद", "1", "श्याम प्रसाद", "सीता देवी", aadhaar("23456789012"), "9876543210", "ram@example.com", "वार्ड 12, लश्कर, ग्वालियर"],
      ["गवाह एक पुत्र श्री पिता एक", "माता एक", aadhaar("34567890123"), "9812345678", "w1@example.com", "मुरार, ग्वालियर 474006"],
      ["सुनीता देवी", "3", "महेश गुप्ता", "माता दो", aadhaar("45678901234"), "9898989898", "w2@example.com", "थाटीपुर, ग्वालियर"],
    ];
    let last: string[] | null = null;
    const asked: string[] = [];
    for (const person of people) for (const answer of person) {
      last = await c.say(answer);
      asked.push(last!.join("\n"));
    }
    expect(asked[1]).toContain("पिता का नाम लिखें"); // after "1" (पुत्र)
    expect(asked[8]).toContain("पहले गवाह की माता का नाम"); // split skipped relation + father
    expect(asked[15]).toContain("पति का नाम लिखें"); // after "3" (पत्नी)
    expect(c.cur.data).toMatchObject({ mortgagorName: "राम प्रसाद", witness1Relation: "पुत्र", witness1FatherName: "पिता एक", witness2Relation: "पत्नी" });
    expect(c.cur.step).toBe("FINAL");
    const summary = last!.join("\n");
    expect(summary).toContain("दस्तावेज़: बंधक पत्र");
    expect(summary).toContain("सैंक्शन लेटर: मिला ✅");
    expect(summary).toContain("रजिस्ट्री वाले मालिक ही वर्तमान मालिक: नहीं");
    expect(summary).toContain("वसीयत/नामांतरण दस्तावेज़: मिला ✅");
    expect(summary).toContain("*बंधककर्ता*");
    expect(summary).toContain("*पहला गवाह*");
    expect(summary).toContain("*दूसरा गवाह*");
    expect(summary).toContain("माता का नाम: सीता देवी");
    const tail = people[0]![4]!.slice(-4);
    expect(summary).toContain(`ड्राफ्ट में: श्री राम प्रसाद पुत्र श्री श्याम प्रसाद (आधार नं. XXXX XXXX ${tail})`);
    expect(summary).toContain("ड्राफ्ट में: श्रीमती सुनीता देवी पत्नी श्री महेश गुप्ता");
    expect(summary).not.toContain(people[0]![4]); // Aadhaar masked in the chat
    expect(c.cur.data.mortgagorAadhaar).toMatch(/^enc:/); // and encrypted at rest
    expect(c.cur.data.witness1Email).toBe("w1@example.com");

    expect((await c.say("हाँ"))!.join()).toContain("अनुरोध नंबर: XYZ123");
    expect(c.cur).toMatchObject({ status: "SUBMITTED", workStatus: "NEW" });
  });

  it("a registry sent when the sanction letter was asked counts as the registry; owner = yes skips the transfer paper", async () => {
    const c = conversation("CHOOSE_DEED", null);
    c.cur.documentKey = undefined; // chose बंधक before sending anything
    expect((await c.say("बंधक पत्र"))!.join()).toContain("सैंक्शन लेटर (PDF");
    c.extractor.extract.mockResolvedValueOnce(saleRegistry);
    expect((await c.send("wa/reg.pdf")).join()).toContain("✅ संपत्ति की रजिस्ट्री मिल गई");
    expect(c.cur.step).toBe("M_SANCTION"); // still needs the sanction letter
    await c.send("wa/sanction.pdf");
    expect(c.cur.step).toBe("M_OWNER");
    expect((await c.say("हाँ"))!.join()).toContain("अब बंधककर्ता और दो गवाहों");
    expect(c.cur.step).toBe("mortgagorName");
  });

  it("'बाद में' for a paper moves on and flags the request for staff", async () => {
    const c = conversation("M_REGISTRY", sanctionLetter, { deedType: "mortgage", docs: { sanction: "wa/first.pdf" } });
    expect((await c.say("कल भेजूँगा"))!.join()).toContain("रजिस्ट्री"); // not a document, not "बाद में" → ask again
    await c.say("बाद में");
    expect(c.cur.data.docs.registry).toBe("later");
    expect(c.cur.needsStaff).toBe(true);
    expect(c.cur.step).toBe("M_OWNER");
  });

  it("an unrecognised first document: asks what it was", async () => {
    const c = conversation("CHOOSE_DEED", { isSaleDeed: false, documentType: null, buyers: [], sellers: [], property: null });
    expect((await c.say("2"))!.join()).toContain("आपने जो दस्तावेज़ भेजा है वह क्या है");
    await c.say("1");
    expect(c.cur.data.docs).toEqual({ sanction: "wa/first.pdf" });
    expect(c.cur.step).toBe("M_REGISTRY");
  });

  it("email is SAMPADA-required: 'नहीं' is not accepted, explains, flags स्टाफ जाँच, asks again", async () => {
    const c = conversation("witness1Email", sanctionLetter, { deedType: "mortgage" });
    for (const answer of ["नहीं", "ईमेल नहीं है", "nahi"]) {
      const reply = (await c.say(answer))!.join();
      expect(reply).toContain("SAMPADA 2.0 पर पक्षकार की ID बनाने के लिए ईमेल ID ज़रूरी है");
      expect(reply).toContain("परिवार के किसी सदस्य की ईमेल ID भी चलेगी");
      expect(c.cur.step).toBe("witness1Email");
    }
    expect(c.cur.needsStaff).toBe(true);
    expect(c.cur.data.witness1Email).toBeUndefined();
    await c.say("parivar@example.com");
    expect(c.cur.data.witness1Email).toBe("parivar@example.com");
    expect(c.cur.step).toBe("witness1Address");
  });

  it("confirming with a SAMPADA field missing (e.g. an email skipped earlier) asks for it first", async () => {
    const full = (p: string, email: string) => ({
      [`${p}Name`]: "नाम",
      [`${p}Relation`]: "पुत्र",
      [`${p}FatherName`]: "पिता",
      [`${p}MotherName`]: "माता",
      [`${p}Aadhaar`]: "enc:x",
      [`${p}Mobile`]: "9876543210",
      [`${p}Email`]: email,
      [`${p}Address`]: "ग्वालियर 474001",
    });
    const c = conversation("FINAL", sanctionLetter, {
      deedType: "mortgage",
      ...full("mortgagor", "a@b.com"),
      ...full("witness1", ""), // skipped under the old rule
      ...full("witness2", "c@d.com"),
    });
    expect((await c.say("हाँ"))!.join()).toContain("SAMPADA 2.0 के लिए एक जानकारी बाकी है");
    expect(c.cur.step).toBe("witness1Email");
    expect(c.cur.status).toBe("ACTIVE");
  });

  it("re-asks a wrong witness Aadhaar", async () => {
    const c = conversation("witness2Aadhaar", sanctionLetter, { deedType: "mortgage" });
    expect((await c.say("123456789012"))!.join()).toContain("आधार नंबर सही नहीं");
    expect(c.cur.step).toBe("witness2Aadhaar");
  });

  it("बदलें on a mortgage restarts at the mortgagor and keeps the deed type", async () => {
    const c = conversation("FINAL", sanctionLetter, { deedType: "mortgage", mortgagorName: "राम" });
    await c.say("बदलें");
    expect(c.cur.step).toBe("mortgagorName");
    expect(c.cur.data).toEqual({ deedType: "mortgage" });
  });

  it("another document: '3' asks which, then records it for staff", async () => {
    const c = conversation("CHOOSE_DEED", sanctionLetter);
    expect((await c.say("3"))!.join()).toContain("कौन सा दस्तावेज़ बनवाना है? संक्षेप में");
    expect((await c.say("दान पत्र बेटे के नाम"))!.join()).toContain("स्टाफ आपसे जल्द संपर्क करेगा");
    expect(c.cur).toMatchObject({ status: "SUBMITTED", workStatus: "NEW", needsStaff: true });
    expect(c.cur.data).toMatchObject({ deedType: "other", requestedDeed: "दान पत्र बेटे के नाम" });
  });

  it("with no conversation, 'बंधक बनाना है' asks for the sanction letter and registry", async () => {
    const c = conversation("NONE", null);
    c.cur.status = "NONE";
    expect((await c.say("मुझे बंधक बनाना है"))!.join()).toContain("सैंक्शन लेटर");
  });
});

describe("mapper: mortgage requests", () => {
  const m = () =>
    row({
      data: {
        deedType: "mortgage",
        mortgagorName: "राम प्रसाद",
        mortgagorAadhaar: encrypt("234567890124"),
        witness1Name: "गवाह एक",
        witness1Aadhaar: encrypt("345678901235"),
      },
    });
  it("shows the mortgagor in the list and all three people (Aadhaar masked) in detail", () => {
    expect(toListItem(m(), null)).toMatchObject({ deedType: "mortgage", buyerName: "राम प्रसाद" });
    const d = toDetail(m(), null, true);
    expect(d.mortgage!.people.map((p) => [p.role, p.name, p.aadhaarMasked])).toEqual([
      ["बंधककर्ता", "राम प्रसाद", "XXXX0124"],
      ["पहला गवाह", "गवाह एक", "XXXX1235"],
      ["दूसरा गवाह", null, null],
    ]);
    expect(JSON.stringify(d)).not.toContain("234567890124");
  });
  it("names the files by what they were sent as and reports the paper checklist", () => {
    const d = toDetail(
      row({
        documentKey: "k/sanction.pdf",
        data: { deedType: "mortgage", docs: { sanction: "k/sanction.pdf", registry: "k/reg.pdf", transfer: "later" }, ownerIsCurrent: false, registryOwners: ["रमेश"], extraDocs: ["k/reg.pdf"] },
      }),
      null,
      true,
    );
    expect(d.documents.map((x) => x.label)).toEqual(["बैंक सैंक्शन लेटर", "संपत्ति की रजिस्ट्री"]);
    expect(d.mortgage).toMatchObject({
      docs: { sanction: "received", registry: "received", transfer: "later" },
      ownerIsCurrent: false,
      registryOwners: ["रमेश"],
    });
  });

  it("reveal returns each person's Aadhaar; old requests default to sale", () => {
    expect(revealSecrets(m()).people).toEqual([
      { role: "बंधककर्ता", aadhaar: "234567890124" },
      { role: "पहला गवाह", aadhaar: "345678901235" },
      { role: "दूसरा गवाह", aadhaar: null },
    ]);
    expect(toListItem(row(), null).deedType).toBe("sale");
    expect(toDetail(row(), null, false).mortgage).toBeNull();
  });
});

describe("office drafting style in the sale flow", () => {
  function convo(step: string, deed: unknown, data: Record<string, unknown> = {}) {
    const cur: any = { id: "cmg1abcdefxyz123", step, status: "ACTIVE", data, deed, needsStaff: false };
    const prisma = {
      draftIntake: {
        findFirst: vi.fn(async () => (cur.status === "ACTIVE" ? cur : null)),
        update: vi.fn(async ({ data }: any) => Object.assign(cur, data)),
        create: vi.fn(async ({ data }: any) => Object.assign(cur, data, { status: "ACTIVE" })),
      },
    };
    const plotDeed = {
      isSaleDeed: true,
      buyers: [{ name: "रमेश", relation: null }],
      sellers: [],
      property: { district: "ग्वालियर", propertyType: "residential_plot", khasraOrPlotNo: "45", areaValue: 1500, areaUnit: "वर्ग फुट" },
    };
    const extractor = { extract: vi.fn(async () => plotDeed) };
    const svc = new DraftIntakeService(prisma as any, extractor as any, { lookup: vi.fn(async () => null) } as any);
    return { cur, svc, say: (t: string) => svc.handleText({ phone: "919876543210", name: "अ" }, t) };
  }

  it("the registry summary gives a plot's area in sqft and sqm", async () => {
    const c = convo("NONE", null);
    c.cur.status = "NONE";
    const out = await c.svc.handleDocument({ phone: "919876543210", name: "अ" }, { key: "k", buf: Buffer.from(""), mime: "application/pdf" });
    expect(out[0]).toContain("क्षेत्रफल: 1500 वर्गफुट यानी 139.35 वर्गमीटर");
  });

  it("a buyer name typed with 'पुत्र श्री' is split, and the summary shows the office line", async () => {
    const c = convo("buyerName", null, { deedType: "sale" });
    expect((await c.say("श्री अमित शर्मा पुत्र श्री राजेश कुमार शर्मा"))!.join()).toContain("माता का नाम");
    expect(c.cur.data).toMatchObject({ buyerName: "अमित शर्मा", buyerRelation: "पुत्र", buyerFatherName: "राजेश कुमार शर्मा" });
    const summary = (c.svc as any).finalSummary({ ...c.cur.data, amount: 1500000, amountMode: "CUSTOM" }) as string;
    expect(summary).toContain("क्रेता पक्ष - श्री अमित शर्मा पुत्र श्री राजेश कुमार शर्मा (आधार नं. ____ ____ ____)");
  });

  it("the relation menu re-asks on a wrong answer and then asks पिता or पति", async () => {
    const c = convo("buyerRelation", null, { deedType: "sale", buyerName: "सीता" });
    expect((await c.say("हाँ"))!.join()).toContain("1, 2 या 3");
    expect((await c.say("3"))!.join()).toContain("पति का नाम");
    expect(c.cur.data.buyerRelation).toBe("पत्नी");
  });
});

describe("DraftIntakeService", () => {
  it("submitting the draft marks it NEW for the office", async () => {
    // A complete sale-deed buyer (all SAMPADA-required fields answered).
    const data = {
      buyerName: "श्याम",
      buyerRelation: "पुत्र",
      buyerFatherName: "मोहन",
      buyerMotherName: "सीता",
      buyerAadhaar: "enc:x",
      buyerMobile: "9876543210",
      buyerEmail: "shyam@example.com",
      buyerAddress: "लश्कर, ग्वालियर",
    };
    const cur = { id: "cmg1abcdefxyz123", step: "FINAL", status: "ACTIVE", data, needsStaff: false };
    const update = vi.fn(async () => ({}));
    const prisma = { draftIntake: { findFirst: vi.fn(async () => cur), update } };
    const svc = new DraftIntakeService(prisma as any, {} as any, {} as any);
    const replies = await svc.handleText({ phone: "919876543210", name: "राम" }, "हाँ");
    expect(update).toHaveBeenCalledWith({ where: { id: cur.id }, data: { status: "SUBMITTED", workStatus: "NEW" } });
    expect(replies?.[0]).toContain("XYZ123");
  });

  it("the buyer-name question says to write only the name", async () => {
    const cur = { id: "x", step: "CONFIRM_PROPERTY", status: "ACTIVE", data: {}, needsStaff: false };
    const prisma = { draftIntake: { findFirst: vi.fn(async () => cur), update: vi.fn(async () => ({})) } };
    const replies = await new DraftIntakeService(prisma as any, {} as any, {} as any).handleText({ phone: "1", name: "" }, "हाँ");
    expect(replies?.[0]).toContain("सिर्फ़ नाम लिखें");
    expect(replies?.[0]).toContain("पिता/पति का नाम आगे पूछा जाएगा");
  });
});
