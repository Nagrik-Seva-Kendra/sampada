import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenDebugOf, tokenVerdicts, WaConnectionService } from "./wa-connection.service.js";

const APP = "920277404216144";
const WABA = "2334208000447723";
const PHONE = "1213900828483766";
const TOKEN = "EAAnewsystemusertokenABCDEFxyz9Q7kLm2";
const SECRET = "appsecret-0123456789";
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
  vi.stubEnv("WA_ACCESS_TOKEN", TOKEN);
  vi.stubEnv("WA_APP_SECRET", SECRET);
  vi.stubEnv("WA_PHONE_NUMBER_ID", PHONE);
  vi.stubEnv("WA_WABA_ID", WABA);
  vi.stubEnv("WA_APP_ID", APP);
  vi.stubEnv("WA_OWNER_NUMBERS", "919111111111");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ctx = { get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role: "OWNER" }) } as any;
const prisma = { waInboundMessage: { findFirst: async () => null } } as any;

/** Mocked Graph: answers by path (query ignored unless a "path?fields=" key exists). */
function graph(routes: Record<string, [number, any]>) {
  const calls: { url: string; auth: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      calls.push({ url, auth: init?.headers?.Authorization ?? "" });
      const full = url.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "");
      const [status, body] = routes[full] ?? routes[full.split("?")[0]!] ?? [404, { error: { code: 803, message: "not routed" } }];
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const debugAnswer = (over: Record<string, unknown> = {}) => ({
  data: {
    app_id: APP,
    type: "SYSTEM_USER",
    application: "NSK Seva Bot",
    data_access_expires_at: 0,
    expires_at: 0,
    is_valid: true,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging", "public_profile"],
    granular_scopes: [
      { scope: "whatsapp_business_management", target_ids: [WABA] },
      { scope: "whatsapp_business_messaging", target_ids: [WABA] },
    ],
    user_id: "122100000000001",
    ...over,
  },
});

const ROUTES = (debug: any, appBiz = "979705032742290") =>
  ({
    "/debug_token": [200, debug],
    [`/${WABA}`]: [200, { id: WABA, name: "Nagrik Seva Kendra", owner_business_info: { id: "979705032742290", name: "NSK" } }],
    [`/${APP}`]: [200, { id: APP, name: "NSK Seva Bot", link: "https://www.facebook.com/games/?app_id=1", owner_business: { id: appBiz, name: "Other" } }],
  }) as Record<string, [number, any]>;

describe("WhatsApp token: what it is allowed to do", () => {
  it("debug_token goes with the app token; the report has tail + length, never the token or secret", async () => {
    const calls = graph(ROUTES(debugAnswer()));
    const r = await new WaConnectionService(prisma, ctx).check(new Date("2026-10-06T10:00:00Z"));
    const t = r.token;
    expect(t.tail).toBe("9Q7kLm2".slice(-6));
    expect(t.length).toBe(TOKEN.length);
    expect(t.debug.data).toMatchObject({
      isValid: true,
      type: "SYSTEM_USER",
      appId: APP,
      application: "NSK Seva Bot",
      userId: "122100000000001",
      expiresAt: "never",
      dataAccessExpiresAt: "never",
      granularScopes: [
        { scope: "whatsapp_business_management", targetIds: [WABA] },
        { scope: "whatsapp_business_messaging", targetIds: [WABA] },
      ],
    });
    expect(t.wabaOwner.data).toMatchObject({ id: WABA, ownerBusinessId: "979705032742290" });
    expect(t.app.data).toMatchObject({ id: APP, ownerBusinessId: "979705032742290" });
    expect(t.verdicts[0]).toMatch(/^✅/);
    const dbg = calls.find((c) => c.url.includes("/debug_token"))!;
    expect(dbg.auth).toBe(`Bearer ${APP}|${SECRET}`);
    expect(calls.find((c) => c.url.includes(`/${WABA}?fields=id,name,owner_business_info`))!.auth).toBe(`Bearer ${TOKEN}`);
    const out = JSON.stringify(r) + logged.join("\n");
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(SECRET);
  });

  it("(a) messaging scope missing → ❌ verdict, also first in findings", async () => {
    graph(ROUTES(debugAnswer({ scopes: ["whatsapp_business_management"], granular_scopes: [{ scope: "whatsapp_business_management", target_ids: [WABA] }] })));
    const r = await new WaConnectionService(prisma, ctx).check();
    expect(r.token.verdicts.join("\n")).toContain("(a)");
    expect(r.findings[0]).toContain("whatsapp_business_messaging");
    expect(r.findings.some((f) => f.startsWith("✅"))).toBe(false);
  });

  it("(b) messaging granted for another WABA; the phone number id also counts as ours", () => {
    const info = (targets: string[] | null) => ({
      tail: "abcdef",
      length: 200,
      debug: { ok: true, error: null, data: tokenDebugOf(debugAnswer({ granular_scopes: [{ scope: "whatsapp_business_messaging", ...(targets ? { target_ids: targets } : {}) }] })) },
      wabaOwner: { ok: false, data: null, error: null },
      app: { ok: false, data: null, error: null },
    });
    const cfg = { appId: APP, wabaId: WABA, phoneNumberId: PHONE };
    const bad = tokenVerdicts(info(["111111111111111"]), cfg).join("\n");
    expect(bad).toContain("(b)");
    expect(bad).toContain("111111111111111");
    expect(tokenVerdicts(info([PHONE]), cfg).join("\n")).not.toContain("(b)");
    expect(tokenVerdicts(info(null), cfg).join("\n")).not.toContain("(b)");
  });

  it("(c) another app's token and (d) invalid / expired token", () => {
    const base = { tail: "abcdef", length: 200, wabaOwner: { ok: false, data: null, error: null }, app: { ok: false, data: null, error: null } };
    const cfg = { appId: APP, wabaId: WABA, phoneNumberId: PHONE };
    const other = tokenVerdicts({ ...base, debug: { ok: true, error: null, data: tokenDebugOf(debugAnswer({ app_id: "799369954601524", application: "AiSensy" })) } }, cfg).join("\n");
    expect(other).toContain("(c)");
    expect(other).toContain("799369954601524");
    const invalid = tokenDebugOf(debugAnswer({ is_valid: false, error: { code: 190, subcode: 460, message: "Session has been invalidated" } }));
    expect(tokenVerdicts({ ...base, debug: { ok: true, error: null, data: invalid } }, cfg).join("\n")).toContain("(d) Token अमान्य या समाप्त है: Session has been invalidated");
    const expired = tokenDebugOf(debugAnswer({ expires_at: 1_700_000_000 }));
    expect(expired.expiresAt).toBe("2023-11-14T22:13:20.000Z");
    expect(tokenVerdicts({ ...base, debug: { ok: true, error: null, data: expired } }, cfg, new Date("2026-10-06")).join("\n")).toContain("(d)");
    expect(tokenVerdicts({ ...base, tail: null, length: 0, debug: { ok: false, data: null, error: null } }, cfg)[0]).toContain("सेट नहीं");
  });

  it("app and WABA in different portfolios → named; app owner falls back to basic fields, then the app token", async () => {
    graph(ROUTES(debugAnswer(), "1337582782761879"));
    const r = await new WaConnectionService(prisma, ctx).check();
    expect(r.token.verdicts.join("\n")).toContain("business 1337582782761879 में है और WABA business 979705032742290 में");

    const calls = graph({
      ...ROUTES(debugAnswer()),
      [`/${APP}?fields=id,name,link,owner_business`]: [400, { error: { code: 100, message: "Tried accessing nonexisting field (owner_business)" } }],
      [`/${APP}?fields=id,name,link`]: [200, { id: APP, name: "NSK Seva Bot", link: "x" }],
    });
    const r2 = await new WaConnectionService(prisma, ctx).check();
    expect(r2.token.app.data).toMatchObject({ id: APP, ownerBusinessId: null });
    expect(r2.token.verdicts.join("\n")).toContain("app का business owner token से पढ़ा नहीं जा सका");
    expect(calls.filter((c) => c.url.includes(`/${APP}?fields=`))).toHaveLength(2);
  });

  it("debug_token itself fails → a warning with Meta's code, nothing secret", async () => {
    graph({ ...ROUTES(debugAnswer()), "/debug_token": [400, { error: { code: 190, message: `Invalid OAuth access token - ${APP}|${SECRET}` } }] });
    const r = await new WaConnectionService(prisma, ctx).check();
    expect(r.token.debug.ok).toBe(false);
    expect(r.token.verdicts[0]).toContain("कोड 190");
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
});
