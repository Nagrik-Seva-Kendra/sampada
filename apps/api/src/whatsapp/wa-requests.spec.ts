import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { WaRequestUpdateInput } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftIntakeService } from "./draft-intake.service.js";
import { encrypt } from "./pii-crypto.js";
import {
  documentKeyAt,
  type DraftIntakeRow,
  localMediaPath,
  maskSecret,
  mimeForKey,
  propertySummary,
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
      expect(out).toEqual({ aadhaar: AADHAAR, pan: PAN, sellerPan: null });
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

describe("DraftIntakeService", () => {
  it("submitting the draft marks it NEW for the office", async () => {
    const cur = { id: "cmg1abcdefxyz123", step: "FINAL", status: "ACTIVE", data: {}, needsStaff: false };
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
    expect(replies?.[0]).toContain("पिता का नाम अगले सवाल में");
  });
});
