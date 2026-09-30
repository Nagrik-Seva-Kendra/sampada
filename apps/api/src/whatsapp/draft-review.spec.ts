import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { maskIdNumbers } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyDraftReply, DraftReviewService } from "./draft-review.service.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { draftReviewOf } from "./wa-requests.mapper.js";

const PHONE = "919755725648";
const AADHAAR = "2345 6789 0124";
const PDF = Buffer.from("%PDF-1.4 test").toString("base64");
let logged: string[] = [];
let dir = "";

beforeEach(async () => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
  dir = await mkdtemp(join(tmpdir(), "wa-draft-"));
  vi.stubEnv("WA_MEDIA_DIR", dir);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("customer copy masking", () => {
  it("keeps only the last 4 of every Aadhaar and PAN", () => {
    const text = `श्री अमित (आधार नं. ${AADHAAR}) (पेन नं. ABCPS1234K), श्रीमती सीता (आधार नं. ३४५६७८९०१२३४) आधार 456789012345`;
    const out = maskIdNumbers(text);
    expect(out).toBe(
      "श्री अमित (आधार नं. XXXX XXXX 0124) (पेन नं. XXXXXX234K), श्रीमती सीता (आधार नं. XXXX XXXX १२३४) आधार XXXX XXXX 2345",
    );
    expect(maskIdNumbers("मूल्य 1500000 रुपये, खसरा 45/2, मोबाइल 9876543210")).toBe("मूल्य 1500000 रुपये, खसरा 45/2, मोबाइल 9876543210");
  });

  it('"SAHI HAI" approves; anything else is a correction', () => {
    for (const t of ["SAHI HAI", "sahi hai", "सही है", "सही है।", " Sahi ", "ok"]) expect(classifyDraftReply(t)).toBe("approved");
    for (const t of ["सही है लेकिन पिता का नाम गलत है", "नाम गलत है", "galat"]) expect(classifyDraftReply(t)).toBe("correction");
  });

  it("draft state for the detail page", () => {
    expect(draftReviewOf({})).toBeNull();
    expect(draftReviewOf({ draftReview: { awaiting: false, sentAt: null } })!.state).toBe("pending");
    expect(draftReviewOf({ draftReview: { awaiting: true, sentAt: "t" } })!.state).toBe("sent");
    expect(draftReviewOf({ draftReview: { result: "correction", reply: { text: "नाम गलत", at: "t2" } } })).toEqual({
      state: "correction",
      sentAt: null,
      reply: "नाम गलत",
      replyAt: "t2",
    });
  });
});

function fixture(over: Record<string, unknown> = {}, role = "OWNER") {
  const row: any = {
    id: "cmg1abcdefxyz123",
    organizationId: "org-1",
    phone: PHONE,
    status: "SUBMITTED",
    workStatus: "DRAFT_READY",
    deedTemplateId: "deed-1",
    assigneeId: null,
    staffNote: null,
    needsStaff: false,
    data: {},
    ...over,
  };
  const corrections: any[] = [];
  const prisma = {
    draftIntake: {
      findFirst: vi.fn(async ({ where }: any) => (where.phone && where.phone !== row.phone ? null : row)),
      update: vi.fn(async ({ data }: any) => Object.assign(row, data)),
    },
    deedTemplate: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.id === "deed-1" && where.organizationId === "org-1"
          ? { id: "deed-1", title: "विक्रय पत्र", content: `क्रेता श्री अमित (आधार नं. ${AADHAAR}) (पेन नं. ABCPS1234K)` }
          : null,
      ),
    },
    $unscoped: { deedCorrectionRequest: { create: vi.fn(async ({ data }: any) => corrections.push(data)) } },
  };
  const outbox = {
    send: vi.fn(async () => ({ id: "n1", status: "SENT" })),
    flushPendingDocuments: vi.fn(async () => [] as { id: string; draftIntakeId: string }[]),
  };
  const cls = { get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role }) };
  return { row, prisma, outbox, corrections, svc: new DraftReviewService(prisma as any, cls as any, outbox as any) };
}

describe("send the draft (OWNER/ADMIN, linked deed, DRAFT_READY)", () => {
  it("customer copy text has Aadhaar/PAN cut to the last 4", async () => {
    const f = fixture();
    const out = await f.svc.forCustomer("cmg1abcdefxyz123");
    expect(out.content).toBe("क्रेता श्री अमित (आधार नं. XXXX XXXX 0124) (पेन नं. XXXXXX234K)");
    expect(out.fileName).toBe("draft-XYZ123.pdf");
  });

  it("refused for employees, without a linked deed, or when not DRAFT_READY", async () => {
    await expect(fixture({}, "EMPLOYEE").svc.forCustomer("cmg1abcdefxyz123")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture({ deedTemplateId: null }).svc.forCustomer("cmg1abcdefxyz123")).rejects.toThrow("कोई डीड जुड़ी नहीं");
    await expect(fixture({ workStatus: "IN_PROGRESS" }).svc.send("cmg1abcdefxyz123", PDF)).rejects.toThrow("ड्राफ्ट तैयार");
    await expect(fixture({ deedTemplateId: "deed-of-other-org" }).svc.forCustomer("cmg1abcdefxyz123")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stores the PDF, sends it as a document with the check request, and waits for the answer", async () => {
    const f = fixture();
    await f.svc.send("cmg1abcdefxyz123", PDF);
    const m = (f.outbox.send.mock.calls[0] as any)[0];
    expect(m).toMatchObject({ kind: "DRAFT", to: PHONE, template: { name: "draft_review_ready", params: ["XYZ123"] } });
    expect(m.text).toContain("SAHI HAI");
    expect(m.document.fileName).toBe("draft-XYZ123.pdf");
    expect((await readFile(join(dir, "whatsapp", "drafts", m.document.key.split("/").pop()))).toString()).toBe("%PDF-1.4 test");
    expect(f.row.data.draftReview).toMatchObject({ notificationId: "n1", awaiting: true });
    await expect(f.svc.send("cmg1abcdefxyz123", Buffer.from("not a pdf").toString("base64"))).rejects.toThrow("PDF फ़ाइल नहीं");
  });
});

describe("customer's answer on WhatsApp", () => {
  const waiting = { data: { draftReview: { notificationId: "n1", awaiting: true } } };

  it('"SAHI HAI" → CUSTOMER_APPROVED', async () => {
    const f = fixture(waiting);
    const out = await f.svc.handleReply(PHONE, "SAHI HAI");
    expect(out![0]).toContain("पुष्टि दर्ज");
    expect(f.row.workStatus).toBe("CUSTOMER_APPROVED");
    expect(f.row.data.draftReview).toMatchObject({ awaiting: false, result: "approved", reply: { text: "SAHI HAI" } });
  });

  it("a correction → CORRECTION_REQUESTED, staff check, DeedCorrectionRequest on the linked deed; text never logged", async () => {
    vi.stubEnv("WA_ALERT_NUMBERS", "9111111111");
    const f = fixture(waiting);
    await f.svc.handleReply(PHONE, "पिता का नाम राजेश कुमार है");
    expect(f.row).toMatchObject({ workStatus: "CORRECTION_REQUESTED", needsStaff: true });
    expect(f.corrections).toEqual([{ deedTemplateId: "deed-1", organizationId: "org-1", message: "WhatsApp ग्राहक (अनुरोध XYZ123): पिता का नाम राजेश कुमार है" }]);
    const alert = (f.outbox.send.mock.calls[0] as any)[0];
    expect(alert).toMatchObject({ kind: "ALERT", to: "919111111111" });
    expect(alert.text).toContain("सुधार माँगा");
    expect(logged.join("\n")).not.toContain("राजेश");
  });

  it("no deed correction possible → kept in the staff note", async () => {
    const f = fixture({ ...waiting, deedTemplateId: null, staffNote: "पुराना नोट" });
    await f.svc.handleReply(PHONE, "नाम गलत है");
    expect(f.row.staffNote).toBe("पुराना नोट\nग्राहक का सुधार (WhatsApp): नाम गलत है");
  });

  it("not waiting, or another number → null (normal bot handling)", async () => {
    expect(await fixture().svc.handleReply(PHONE, "SAHI HAI")).toBeNull();
    expect(await fixture(waiting).svc.handleReply("919000000001", "SAHI HAI")).toBeNull();
  });

  it("a PDF that went out after the customer wrote starts the wait", async () => {
    const f = fixture({ data: { draftReview: { notificationId: "n7", awaiting: false } } });
    f.outbox.flushPendingDocuments.mockResolvedValueOnce([{ id: "n7", draftIntakeId: "cmg1abcdefxyz123" }]);
    await f.svc.flushPending(PHONE);
    expect(f.row.data.draftReview.awaiting).toBe(true);
  });
});

describe("outbox: documents only inside the 24h window", () => {
  function outboxWith(lastInboundAt: Date | null) {
    const rows: any[] = [];
    const prisma = {
      waContact: { findUnique: vi.fn(async () => (lastInboundAt ? { phone: PHONE, lastInboundAt } : null)) },
      waNotification: {
        create: vi.fn(async ({ data }: any) => {
          const r = { id: `n${rows.length + 1}`, createdAt: new Date(), sentAt: null, ...data };
          rows.push(r);
          return r;
        }),
      },
    };
    return new WaOutboxService(prisma as any);
  }
  const doc = async () => {
    const { putMedia } = await import("./wa-media.js");
    await putMedia("whatsapp/org-1/drafts/d.pdf", Buffer.from("%PDF-1.4"), "application/pdf");
    return { key: "whatsapp/org-1/drafts/d.pdf", fileName: "draft-XYZ123.pdf", mime: "application/pdf" };
  };
  const base = { organizationId: "org-1", draftIntakeId: "cmg1abcdefxyz123", kind: "DRAFT" as const, to: PHONE, text: "जाँचें", template: { name: "draft_review_ready", language: "hi", params: ["XYZ123"] } };

  beforeEach(() => {
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
  });

  it("inside: uploads the PDF and sends it as a document", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        calls.push(url.endsWith("/media") ? "media" : JSON.parse(init.body).type);
        return new Response(JSON.stringify(url.endsWith("/media") ? { id: "MEDIA1" } : { messages: [{ id: "w1" }] }), { status: 200 });
      }),
    );
    const n = await outboxWith(new Date()).send({ ...base, document: await doc() });
    expect(calls).toEqual(["media", "document"]);
    expect(n).toMatchObject({ status: "SENT", via: "document" });
  });

  it("outside: sends the notice template, the PDF stays PENDING", async () => {
    const calls: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        calls.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ messages: [{ id: "w1" }] }), { status: 200 });
      }),
    );
    const n = await outboxWith(null).send({ ...base, document: await doc() });
    expect(calls.map((c) => c.type)).toEqual(["template"]);
    expect(n).toMatchObject({ status: "PENDING", reason: "ग्राहक को सूचना भेजी — जवाब आते ही PDF अपने-आप जाएगी" });
  });
});
