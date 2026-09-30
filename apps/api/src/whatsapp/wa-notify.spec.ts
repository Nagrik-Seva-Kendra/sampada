import { Logger } from "@nestjs/common";
import { statusText, WA_TEMPLATES } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillTemplate, reasonFor, templatePayload, WaOutboxService } from "./wa-outbox.service.js";
import type { DraftIntakeRow } from "./wa-requests.mapper.js";
import { WaRequestsService } from "./wa-requests.service.js";
import { templateSubmission } from "./wa-templates.service.js";

const PHONE = "919876543210";
let logged: string[] = [];
beforeEach(() => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(`${level}: ${String(m)}`);
    }) as never);
  }
  vi.stubEnv("WA_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** In-memory WaContact + WaNotification. */
function fakePrisma(lastInboundAt: Date | null) {
  const rows: any[] = [];
  return {
    rows,
    waContact: {
      findUnique: vi.fn(async () => (lastInboundAt ? { phone: PHONE, lastInboundAt } : null)),
      upsert: vi.fn(async () => ({})),
    },
    waNotification: {
      create: vi.fn(async ({ data }: any) => {
        const r = { id: `n${rows.length + 1}`, createdAt: new Date(), template: null, reason: null, wamid: null, sentAt: null, via: null, ...data };
        rows.push(r);
        return r;
      }),
      findFirst: vi.fn(async ({ where }: any) => rows.find((r) => r.id === where.id && r.draftIntakeId === where.draftIntakeId) ?? null),
      findMany: vi.fn(async () => rows),
      update: vi.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
    },
  };
}

/** Graph stub: answers each /messages call from a queue of {ok, code}. */
function graph(...answers: { ok: boolean; code?: number }[]) {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      const a = answers.shift() ?? { ok: true };
      return new Response(JSON.stringify(a.ok ? { messages: [{ id: "wamid.1" }] } : { error: { code: a.code, message: `+${PHONE} secret body` } }), {
        status: a.ok ? 200 : 400,
      });
    }),
  );
  return calls;
}

const msg = {
  organizationId: "org-1",
  draftIntakeId: "cmg1abcdefxyz123",
  kind: "STATUS" as const,
  to: PHONE,
  text: statusText("XYZ123", "DRAFT_READY"),
  template: { name: WA_TEMPLATES.status.name, language: "hi", params: ["XYZ123", "आपका ड्राफ्ट तैयार है"] },
};

describe("WaOutboxService: 24h window → text, else template, else PENDING", () => {
  it("inside the window sends plain text", async () => {
    const prisma = fakePrisma(new Date(Date.now() - 3600_000));
    const calls = graph({ ok: true });
    const n = await new WaOutboxService(prisma as any).send(msg);
    expect(n).toMatchObject({ status: "SENT", via: "text", toMasked: "********3210" });
    expect(calls[0]).toMatchObject({ to: PHONE, type: "text" });
    expect(calls[0].text.body).toContain("अनुरोध नंबर XYZ123");
  });

  it("outside the window sends the template with the request number", async () => {
    const prisma = fakePrisma(new Date(Date.now() - 30 * 3600_000));
    const calls = graph({ ok: true });
    const n = await new WaOutboxService(prisma as any).send(msg);
    expect(n).toMatchObject({ status: "SENT", via: "template" });
    expect(calls).toHaveLength(1);
    expect(calls[0].template).toEqual({
      name: "request_status_update",
      language: { code: "hi" },
      components: [{ type: "body", parameters: [{ type: "text", text: "XYZ123" }, { type: "text", text: "आपका ड्राफ्ट तैयार है" }] }],
    });
  });

  it("template not approved → PENDING with a reason; resend later succeeds; logs never carry the text", async () => {
    const prisma = fakePrisma(null);
    graph({ ok: false, code: 132001 });
    const svc = new WaOutboxService(prisma as any);
    const n = await svc.send(msg);
    expect(n).toMatchObject({ status: "PENDING", via: null, reason: "WhatsApp टेम्पलेट स्वीकृत नहीं / मौजूद नहीं" });
    expect(prisma.rows[0].body).toBe(msg.text); // record kept on the request

    graph({ ok: true });
    const again = await svc.resend("cmg1abcdefxyz123", n.id);
    expect(again).toMatchObject({ status: "SENT", via: "template" });
    await expect(svc.resend("other-request", n.id)).rejects.toThrow("संदेश नहीं मिला");
    const all = logged.join("\n");
    expect(all).toContain("STATUS for request XYZ123 to ********3210: PENDING");
    expect(all).not.toContain("अनुरोध नंबर");
    expect(all).not.toContain(PHONE);
  });

  it("text fails inside the window (e.g. closed early) → falls back to the template", async () => {
    const prisma = fakePrisma(new Date());
    const calls = graph({ ok: false, code: 131047 }, { ok: true });
    expect(await new WaOutboxService(prisma as any).send(msg)).toMatchObject({ status: "SENT", via: "template" });
    expect(calls.map((c) => c.type)).toEqual(["text", "template"]);
  });

  it("not configured → PENDING without calling Graph", async () => {
    vi.stubEnv("WA_ACCESS_TOKEN", "");
    const calls = graph();
    expect(await new WaOutboxService(fakePrisma(new Date()) as any).send(msg)).toMatchObject({ status: "PENDING" });
    expect(calls).toHaveLength(0);
  });

  it("helpers: filled template, Meta submission body, parameter clean-up, reasons", () => {
    expect(fillTemplate(WA_TEMPLATES.status, ["AB12CD", "आपका काम पूरा हो गया है"])).toBe(
      "नमस्ते, नागरिक सेवा केंद्र से सूचना: अनुरोध नंबर AB12CD — आपका काम पूरा हो गया है। धन्यवाद।",
    );
    expect(templateSubmission(WA_TEMPLATES.status)).toEqual({
      name: "request_status_update",
      language: "hi",
      category: "UTILITY",
      components: [{ type: "BODY", text: WA_TEMPLATES.status.body, example: { body_text: [[...WA_TEMPLATES.status.example]] } }],
    });
    expect(templatePayload({ name: "t", language: "hi", params: ["a\nb", ""] }).components[0]!.parameters).toEqual([
      { type: "text", text: "a b" },
      { type: "text", text: "-" },
    ]);
    expect(reasonFor(131047, "text")).toContain("24 घंटे");
    expect(reasonFor(500, "template")).toBe("भेजा नहीं जा सका (template, कोड 500)");
    // Meta rejects a body that starts or ends with a variable.
    expect(WA_TEMPLATES.status.body).not.toMatch(/^\{\{|\}\}$/);
  });
});

describe("status change → customer message", () => {
  const row = (over: Partial<DraftIntakeRow> = {}): DraftIntakeRow => ({
    id: "cmg1abcdefxyz123",
    organizationId: "org-1",
    phone: PHONE,
    customerName: "राम",
    status: "SUBMITTED",
    step: "FINAL",
    data: {},
    deed: null,
    documentKey: null,
    needsStaff: false,
    workStatus: "NEW",
    assigneeId: null,
    staffNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });
  function svcFor(r: DraftIntakeRow) {
    const prisma = {
      draftIntake: {
        findFirst: vi.fn(async () => r),
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(r, data);
          return { count: 1 };
        }),
      },
      user: { findMany: vi.fn(async () => []) },
    };
    const outbox = { send: vi.fn(async () => ({})), list: vi.fn(async () => []), resend: vi.fn(async () => ({ status: "SENT" })) };
    const cls = { get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role: "OWNER" }) };
    return { svc: new WaRequestsService(prisma as any, cls as any, outbox as any), outbox };
  }

  it("each of IN_PROGRESS / DRAFT_READY / DONE / REJECTED sends one Hindi message with the request number", async () => {
    for (const ws of ["IN_PROGRESS", "DRAFT_READY", "DONE", "REJECTED"] as const) {
      const { svc, outbox } = svcFor(row());
      await svc.update("cmg1abcdefxyz123", { workStatus: ws });
      expect(outbox.send).toHaveBeenCalledTimes(1);
      const m = (outbox.send.mock.calls[0] as any)[0];
      expect(m).toMatchObject({ kind: "STATUS", to: PHONE, draftIntakeId: "cmg1abcdefxyz123" });
      expect(m.text).toContain("अनुरोध नंबर XYZ123");
      expect(m.template.params[0]).toBe("XYZ123");
    }
  });

  it("no message when the status is unchanged, set back to NEW, only the note changes, or the request was never submitted", async () => {
    for (const [r, input] of [
      [row({ workStatus: "DONE" }), { workStatus: "DONE" }],
      [row({ workStatus: "IN_PROGRESS" }), { workStatus: "NEW" }],
      [row(), { staffNote: "x" }],
      [row({ status: "ACTIVE", workStatus: null }), { workStatus: "IN_PROGRESS" }],
    ] as const) {
      const { svc, outbox } = svcFor(r as DraftIntakeRow);
      await svc.update("cmg1abcdefxyz123", input as any);
      expect(outbox.send).not.toHaveBeenCalled();
    }
  });

  it("a failing send never blocks the status change", async () => {
    const r = row();
    const { svc, outbox } = svcFor(r);
    outbox.send.mockRejectedValueOnce(new Error("db down"));
    await expect(svc.update("cmg1abcdefxyz123", { workStatus: "DONE" })).resolves.toBeTruthy();
    expect(r.workStatus).toBe("DONE");
  });
});
