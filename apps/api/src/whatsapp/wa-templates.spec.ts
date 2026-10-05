import { ConflictException, Logger } from "@nestjs/common";
import { templateProblems, WA_TEMPLATES, type WaTemplateDef } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanMetaText, WaTemplatesService } from "./wa-templates.service.js";

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
  vi.stubEnv("WA_WABA_ID", "1234567890123");
  vi.stubEnv("WA_ACCESS_TOKEN", "EAAtesttoken1234567890");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ctx = { get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m1", role: "OWNER" }) } as any;
const OLD_ALERT = {
  name: "new_request_alert",
  body: "नया WhatsApp अनुरोध {{1}} — दस्तावेज़: {{2}}, ग्राहक: {{3}} ({{4}}), स्टाफ जाँच: {{5}}। देखें: {{6}} धन्यवाद।",
  example: ["AB12CD", "विक्रय पत्र", "अमित शर्मा", "********3210", "नहीं", "https://app.nsk.mpe-registry.com/whatsapp-requests/abc123"],
};

describe("template rules (checked before submitting)", () => {
  it("every configured template passes; the old new_request_alert did not", () => {
    for (const [key, t] of Object.entries(WA_TEMPLATES as Record<string, WaTemplateDef>)) expect([key, templateProblems(t)]).toEqual([key, []]);
    expect(templateProblems(OLD_ALERT)).toEqual(expect.arrayContaining(["tooManyVariables", "exampleFormat"]));
    expect(WA_TEMPLATES.alert.name).toBe("new_request_alert_v2");
  });

  it("start / end / adjacent / numbering / example count / name", () => {
    expect(templateProblems({ name: "x", body: "{{1}} नमस्ते आप कैसे हैं आज", example: ["a"] })).toContain("startsWithVariable");
    expect(templateProblems({ name: "x", body: "नमस्ते आप कैसे हैं आज {{1}}।", example: ["a"] })).toContain("endsWithVariable");
    expect(templateProblems({ name: "x", body: "नमस्ते {{1}} {{2}} आप कैसे हैं आज यहाँ वहाँ", example: ["a", "b"] })).toContain("adjacentVariables");
    expect(templateProblems({ name: "x", body: "नमस्ते {{2}} आप कैसे हैं आज यहाँ", example: ["a"] })).toContain("variableNumbering");
    expect(templateProblems({ name: "x", body: "नमस्ते {{1}} आप कैसे हैं आज", example: [] })).toContain("exampleCount");
    expect(templateProblems({ name: "New-Alert", body: "नमस्ते {{1}} आप कैसे हैं आज", example: ["a"] })).toContain("name");
  });
});

/** Graph: GET list → the given existing names; POST → refuse `refuse`, accept the rest. */
function graph(existing: string[], refuse: Record<string, any> = {}, delayMs = 0) {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: any) => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (!init?.method) return new Response(JSON.stringify({ data: existing.map((name) => ({ name, status: "PENDING", language: "hi" })) }), { status: 200 });
      const name = JSON.parse(init.body).name;
      posts.push(name);
      if (refuse[name]) return new Response(JSON.stringify({ error: refuse[name] }), { status: 400 });
      return new Response(JSON.stringify({ id: "1", status: "PENDING" }), { status: 200 });
    }),
  );
  return posts;
}

describe("WaTemplatesService.submit", () => {
  const others = Object.values(WA_TEMPLATES as Record<string, WaTemplateDef>).map((t) => t.name).filter((n) => n !== WA_TEMPLATES.alert.name);

  it("a refusal shows Meta's subcode, title and message — without tokens or numbers", async () => {
    graph(others, {
      [WA_TEMPLATES.alert.name]: {
        code: 100,
        error_subcode: 2388293,
        error_user_title: "Variables ratio",
        error_user_msg: "Too many variables for the message length. access_token=EAAsecret999999999 call 9876543210",
        message: "Invalid parameter",
      },
    });
    const out = await new WaTemplatesService(ctx).submit();
    const row = out.find((o) => o.name === WA_TEMPLATES.alert.name)!;
    expect(row).toMatchObject({ code: "error", errorCode: 100, errorSubcode: 2388293, errorTitle: "Variables ratio" });
    expect(row.errorMessage).toContain("Too many variables");
    expect(row.result).toContain("कोड 100/2388293");
    expect(out.filter((o) => o.code === "exists")).toHaveLength(others.length);
    const all = logged.join("\n") + JSON.stringify(out);
    expect(all).toContain("subcode=2388293");
    expect(all).toContain('title="Variables ratio"');
    for (const secret of ["EAAsecret", "EAAtesttoken", "9876543210", "1234567890123"]) expect(all).not.toContain(secret);
  });

  it("double click: a second submission while one runs is refused, nothing is sent twice", async () => {
    const posts = graph([], {}, 5);
    const svc = new WaTemplatesService(ctx);
    const [a, b] = await Promise.allSettled([svc.submit(), svc.submit()]);
    expect(a.status).toBe("fulfilled");
    expect(b.status === "rejected" && b.reason).toBeInstanceOf(ConflictException);
    expect(posts).toHaveLength(Object.keys(WA_TEMPLATES).length);
    expect(new Set(posts).size).toBe(posts.length);
    // Once finished, the next click works again.
    graph(Object.values(WA_TEMPLATES as Record<string, WaTemplateDef>).map((t) => t.name));
    expect((await svc.submit()).every((o) => o.code === "exists")).toBe(true);
  });

  it("cleanMetaText: hides tokens and long numbers, bounded", () => {
    expect(cleanMetaText("Bearer EAAabcdefghijklmnop failed for +91 98765 43210")).toBe("Bearer [hidden] failed for +[number]");
    expect(cleanMetaText("x".repeat(500))).toHaveLength(300);
    expect(cleanMetaText(undefined)).toBeUndefined();
  });
});
