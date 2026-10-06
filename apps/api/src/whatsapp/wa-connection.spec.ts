import { ForbiddenException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webhookUrl } from "./wa-connection.controller.js";
import { connectionFindings, testHint, WaConnectionService } from "./wa-connection.service.js";
import { WhatsappController } from "./whatsapp.controller.js";
import { cleanMetaText, connectionStats, metaErrorOf } from "./webhook-diagnostics.js";

const APP = "920277404216144";
const AISENSY = "799369954601524";
const TOKEN = "EAAsystemusertoken1234567890";
const SECRET = "appsecret-abcdef";
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
  vi.stubEnv("WA_VERIFY_TOKEN", "verify-me");
  vi.stubEnv("WA_PHONE_NUMBER_ID", "111222333444555");
  vi.stubEnv("WA_WABA_ID", "666777888999000");
  vi.stubEnv("WA_APP_ID", APP);
  vi.stubEnv("WA_OWNER_NUMBERS", "919111111111");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ctx = (role = "OWNER") => ({ get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role }) }) as any;
const prisma = { waInboundMessage: { findFirst: async () => ({ createdAt: new Date("2026-10-04T10:00:00Z") }) } } as any;

/** Graph answers by path; records every call's URL and auth header. */
function graph(routes: Record<string, [number, any]>) {
  const calls: { url: string; auth: string; body?: any }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      calls.push({ url, auth: init?.headers?.Authorization ?? "", body: init?.body ? JSON.parse(init.body) : undefined });
      const path = url.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "").split("?")[0]!;
      const [status, body] = routes[path] ?? [404, { error: { code: 803, message: "not routed" } }];
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const HEALTHY = {
  "/666777888999000/subscribed_apps": [200, { data: [{ whatsapp_business_api_data: { id: AISENSY, name: "AiSensy" } }, { whatsapp_business_api_data: { id: APP, name: "NSK Seva Bot" } }] }],
  "/111222333444555": [
    200,
    {
      display_phone_number: "+91 85170 56224",
      verified_name: "Nagrik Seva Kendra",
      status: "CONNECTED",
      platform_type: "CLOUD_API",
      code_verification_status: "VERIFIED",
      account_mode: "LIVE",
      webhook_configuration: { application: "https://app.nsk.mpe-registry.com/api/v1/whatsapp/webhook" },
      id: "111222333444555",
    },
  ],
  "/666777888999000": [200, { name: "Nagrik Seva Kendra", account_review_status: "APPROVED", business_verification_status: "verified", ownership_type: "SELF" }],
  [`/${APP}/subscriptions`]: [200, { data: [{ object: "whatsapp_business_account", callback_url: "https://app.nsk.mpe-registry.com/api/v1/whatsapp/webhook", active: true, fields: [{ name: "messages", version: "v21.0" }] }] }],
} as Record<string, [number, any]>;

describe("WhatsApp connection check", () => {
  it("reads subscribed apps, number, WABA and app subscriptions; app token only goes to Meta; nothing secret comes back", async () => {
    const calls = graph(HEALTHY);
    const r = await new WaConnectionService(prisma, ctx()).check(new Date());
    expect(r.subscribedApps.data!.apps).toEqual([
      expect.objectContaining({ id: AISENSY, name: "AiSensy", isThisApp: false }),
      expect.objectContaining({ id: APP, name: "NSK Seva Bot", isThisApp: true }),
    ]);
    expect(r.phone.data).toMatchObject({ platform_type: "CLOUD_API", status: "CONNECTED" });
    expect(r.waba.data).toMatchObject({ account_review_status: "APPROVED" });
    expect(r.appSubscriptions.data![0]).toMatchObject({ object: "whatsapp_business_account", fields: ["messages"], active: true });
    expect(r.webhook.lastStoredMessageAt).toBe("2026-10-04T10:00:00.000Z");
    expect(calls.find((c) => c.url.includes("/subscriptions"))!.auth).toBe(`Bearer ${APP}|${SECRET}`);
    expect(calls.find((c) => c.url.includes("fields=display_phone_number"))!.url).toContain("webhook_configuration");
    const out = JSON.stringify(r) + logged.join("\n");
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(SECRET);
    expect(r.findings.join("\n")).toContain("AiSensy");
    expect(r.findings.some((f) => f.startsWith("❌"))).toBe(false);
  });

  it("findings name the cause: app not subscribed, 'messages' missing, override elsewhere, not on Cloud API", async () => {
    graph({
      ...HEALTHY,
      "/666777888999000/subscribed_apps": [200, { data: [{ whatsapp_business_api_data: { id: AISENSY, name: "AiSensy" } }] }],
      "/111222333444555": [200, { status: "CONNECTED", platform_type: "ON_PREMISE", webhook_configuration: { application: "https://app.nsk.mpe-registry.com/api/v1/whatsapp/webhook", phone_number: "https://apis.aisensy.com/wa/webhook" } }],
      [`/${APP}/subscriptions`]: [200, { data: [{ object: "whatsapp_business_account", callback_url: "https://app.nsk.mpe-registry.com/api/v1/whatsapp/webhook", active: true, fields: [{ name: "message_template_status_update" }] }] }],
    });
    const f = (await new WaConnectionService(prisma, ctx()).check()).findings.join("\n");
    expect(f).toContain(`हमारा app (${APP}) इस WABA से जुड़ा (subscribed) नहीं है`);
    expect(f).toContain('"messages" field subscribe नहीं है');
    expect(f).toContain("https://apis.aisensy.com/wa/webhook");
    expect(f).toContain("platform_type=ON_PREMISE");
  });

  it("Meta errors are shown with code / subcode / user message; an unknown field is retried with the basic ones", async () => {
    const calls = graph({
      ...HEALTHY,
      "/666777888999000": [400, { error: { code: 200, error_subcode: 2494010, error_user_title: "Permission", error_user_msg: "No access to 666777888999000 with token EAAxyzxyzxyzxyzxyz", message: "x" } }],
    });
    const r = await new WaConnectionService(prisma, ctx()).check();
    expect(r.waba.error).toMatchObject({ http: 400, code: 200, subcode: 2494010, title: "Permission" });
    expect(r.waba.error!.message).toBe("No access to [number] with token [hidden]");
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("owner only; a test message shows Meta's full answer and a Hindi hint", async () => {
    await expect(new WaConnectionService(prisma, ctx("ADMIN")).check()).rejects.toBeInstanceOf(ForbiddenException);
    const calls = graph({ "/111222333444555/messages": [400, { error: { code: 131047, error_subcode: 2494010, message: "Re-engagement message", error_data: { details: "More than 24 hours have passed" } } }] });
    const r = await new WaConnectionService(prisma, ctx()).testMessage();
    expect(r).toMatchObject({ ok: false, to: "********1111", error: { code: 131047, details: "More than 24 hours have passed" } });
    expect(r.hint).toContain("24 घंटे");
    expect(calls[0]!.body).toMatchObject({ to: "919111111111", type: "text" });
    expect(connectionStats().outbound).toMatchObject({ kind: "test", ok: false, error: { code: 131047 } });
    expect(testHint({ code: 190 } as any)).toContain("token");
  });

  it("re-subscribe, optionally with this server's URL as the override (verify token sent to Meta only)", async () => {
    const calls = graph({ "/666777888999000/subscribed_apps": [200, { success: true }] });
    expect(await new WaConnectionService(prisma, ctx()).resubscribe(null)).toMatchObject({ ok: true, data: { success: true } });
    await new WaConnectionService(prisma, ctx()).resubscribe("https://api.nsk.mpe-registry.com/api/v1/whatsapp/webhook");
    expect(calls[0]!.body).toEqual({});
    expect(calls[1]!.body).toEqual({ override_callback_uri: "https://api.nsk.mpe-registry.com/api/v1/whatsapp/webhook", verify_token: "verify-me" });
    expect(webhookUrl({ headers: { host: "api.nsk.mpe-registry.com" } } as any)).toBe("https://api.nsk.mpe-registry.com/api/v1/whatsapp/webhook");
    expect(webhookUrl({ headers: { host: "evil.com/x?y" } } as any)).toBeNull();
  });

  it("every webhook POST is counted and logged, valid signature or not; no webhook for long → finding", async () => {
    const before = connectionStats().webhook.posts;
    const wa: any = { verifySignature: () => ({ ok: false, reason: "mismatch" }), handlePayload: async () => undefined };
    const c = new WhatsappController(wa);
    expect(() => c.receive({ body: { object: "whatsapp_business_account", entry: [] }, rawBody: Buffer.from("{}") } as any, "sha256=00")).toThrow();
    wa.verifySignature = () => ({ ok: true });
    c.receive({ body: { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ type: "text" }] } }] }] }, rawBody: Buffer.from("{}") } as any, "sha256=00");
    const w = connectionStats().webhook;
    expect(w.posts).toBe(before + 2);
    expect(w.invalidSignature).toBeGreaterThanOrEqual(1);
    expect(w.lastSignatureOk).toBe(true);
    expect(w.lastMessageAt).not.toBeNull();
    expect(logged.filter((l) => l.startsWith("webhook POST signature="))).toHaveLength(2);

    const quiet = connectionFindings(
      {
        checkedAt: "",
        config: { graphVersion: "v21.0", phoneNumberId: "1", wabaId: "2", appId: APP, accessToken: true, appSecret: true, verifyToken: true, ownerNumbers: 1 },
        subscribedApps: { ok: true, error: null, data: { apps: [{ id: APP, name: "NSK", link: null, overrideCallback: null, isThisApp: true }] } },
        phone: { ok: true, error: null, data: { platform_type: "CLOUD_API", status: "CONNECTED" } },
        waba: { ok: true, error: null, data: {} },
        appSubscriptions: { ok: true, error: null, data: [{ object: "whatsapp_business_account", callbackUrl: "https://x/api/v1/whatsapp/webhook", active: true, fields: ["messages"] }] },
        webhook: { ...connectionStats().webhook, posts: 0, startedAt: new Date(Date.now() - 17 * 3600_000).toISOString(), lastStoredMessageAt: null },
        lastOutbound: null,
      },
      new Date(),
    ).join("\n");
    expect(quiet).toContain("17 घंटे से चालू है पर Meta से एक भी webhook नहीं आया");
    expect(quiet).toContain("Live");
  });

  it("metaErrorOf / cleanMetaText", () => {
    expect(metaErrorOf({ error: { code: 100, error_subcode: 33, message: "Unsupported get request" } }, 400)).toMatchObject({ code: 100, subcode: 33, message: "Unsupported get request" });
    expect(cleanMetaText("secret=abc token=EAAxx")).toBe("secret [hidden] token [hidden]");
  });
});
