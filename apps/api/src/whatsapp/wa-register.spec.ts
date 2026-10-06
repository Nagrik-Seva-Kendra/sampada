import { BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerHint, registrationVerdicts, WaConnectionService } from "./wa-connection.service.js";

const APP = "920277404216144";
const WABA = "2334208000447723";
const PHONE = "1213900828483766";
const TOKEN = "EAAnewsystemusertokenABCDEFxyz9Q7kLm2";
const SECRET = "appsecret-0123456789";
const PIN = "482915";
const SYSUSER = "122100000000001";
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
  vi.stubEnv("WA_REGISTER_PIN", PIN);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ctx = (role = "OWNER") => ({ get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role }) }) as any;
const prisma = { waInboundMessage: { findFirst: async () => null } } as any;

function graph(routes: Record<string, [number, any]>) {
  const calls: { url: string; method: string; auth: string; body?: any }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      calls.push({ url, method: init?.method ?? "GET", auth: init?.headers?.Authorization ?? "", body: init?.body ? JSON.parse(init.body) : undefined });
      const full = url.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "");
      const [status, body] = routes[full] ?? routes[full.split("?")[0]!] ?? [404, { error: { code: 803, message: "not routed" } }];
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const CHECK_ROUTES = (users: any[], phone: Record<string, unknown> = { code_verification_status: "EXPIRED", platform_type: "NOT_APPLICABLE", status: "DISCONNECTED", is_pin_enabled: true }) =>
  ({
    "/debug_token": [200, { data: { app_id: APP, type: "SYSTEM_USER", is_valid: true, expires_at: 0, scopes: ["whatsapp_business_messaging", "whatsapp_business_management"], user_id: SYSUSER } }],
    [`/${WABA}`]: [200, { id: WABA, name: "NSK", owner_business_info: { id: "979705032742290", name: "NSK" } }],
    [`/${PHONE}?fields=code_verification_status,platform_type,status,is_pin_enabled`]: [200, { ...phone, id: PHONE }],
    [`/${WABA}/assigned_users`]: [200, { data: users }],
  }) as Record<string, [number, any]>;

describe("Register the number on this app", () => {
  it("POST /{phone}/register with messaging_product + PIN from env; the PIN never comes back or gets logged", async () => {
    const calls = graph({ [`/${PHONE}/register`]: [200, { success: true }] });
    const r = await new WaConnectionService(prisma, ctx()).register();
    expect(r).toMatchObject({ ok: true, error: null });
    expect(calls[0]).toMatchObject({ method: "POST", auth: `Bearer ${TOKEN}`, body: { messaging_product: "whatsapp", pin: PIN } });
    const out = JSON.stringify(r) + logged.join("\n");
    expect(out).not.toContain(PIN);
    expect(out).not.toContain(TOKEN);
  });

  it("wrong two-step PIN → Meta's code + a Hindi hint; PIN echoed by Meta is removed", async () => {
    graph({ [`/${PHONE}/register`]: [400, { error: { code: 133005, message: `Two step verification PIN Mismatch (pin ${PIN})`, error_data: { details: "PIN mismatch" } } }] });
    const r = await new WaConnectionService(prisma, ctx()).register();
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ http: 400, code: 133005, details: "PIN mismatch" });
    expect(r.error!.message).toBe("Two step verification PIN Mismatch (pin [pin])");
    expect(r.hint).toContain("two-step verification PIN");
    expect(JSON.stringify(r) + logged.join("\n")).not.toContain(PIN);
    expect(logged.some((l) => l.includes("code=133005"))).toBe(true);
  });

  it("no / malformed WA_REGISTER_PIN → clear message, Meta not called; owner only", async () => {
    const calls = graph({});
    vi.stubEnv("WA_REGISTER_PIN", "");
    await expect(new WaConnectionService(prisma, ctx()).register()).rejects.toThrow(/WA_REGISTER_PIN सेट नहीं है/);
    vi.stubEnv("WA_REGISTER_PIN", "12345");
    await expect(new WaConnectionService(prisma, ctx()).register()).rejects.toBeInstanceOf(BadRequestException);
    await expect(new WaConnectionService(prisma, ctx("ADMIN")).register()).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls).toHaveLength(0);
    expect(registerHint({ code: 133006 } as any)).toContain("OTP");
    expect(registerHint({ code: 200 } as any)).toContain("Full control");
  });

  it("check shows registration status and assigned users; disconnected number + missing system user are ❌ findings", async () => {
    const calls = graph(CHECK_ROUTES([{ id: "999", name: "Admin person", tasks: ["MANAGE"] }]));
    const r = await new WaConnectionService(prisma, ctx()).check();
    expect(r.registration.pinConfigured).toBe(true);
    expect(r.registration.phone.data).toEqual({ codeVerificationStatus: "EXPIRED", platformType: "NOT_APPLICABLE", status: "DISCONNECTED", isPinEnabled: true });
    expect(r.registration.assignedUsers.data).toEqual([{ id: "999", name: "Admin person", tasks: ["MANAGE"], isTokenUser: false }]);
    const v = r.registration.verdicts.join("\n");
    expect(v).toContain("Register number on this app");
    expect(v).toContain(`Token वाला system user (${SYSUSER})`);
    expect(v).toContain("two-step PIN पहले से लगा है");
    expect(r.findings[0]).toMatch(/^❌/);
    expect(calls.find((c) => c.url.includes("/assigned_users"))!.url).toContain("business=979705032742290");
    expect(JSON.stringify(r)).not.toContain(PIN);
  });

  it("system user assigned with full control on a connected Cloud API number → ✅; partial tasks → ⚠️", () => {
    const phone = { ok: true, error: null, data: { codeVerificationStatus: "VERIFIED", platformType: "CLOUD_API", status: "CONNECTED", isPinEnabled: true } };
    const users = (tasks: string[]) => ({ ok: true, error: null, data: [{ id: SYSUSER, name: "nskbot-live", tasks, isTokenUser: true }] });
    const ok = registrationVerdicts({ pinConfigured: true, phone, assignedUsers: users(["MANAGE", "DEVELOP"]) }, SYSUSER);
    expect(ok.some((x) => x.startsWith("❌"))).toBe(false);
    expect(ok.join("\n")).toContain("✅ System user (nskbot-live)");
    const partial = registrationVerdicts({ pinConfigured: false, phone, assignedUsers: users(["DEVELOP"]) }, SYSUSER).join("\n");
    expect(partial).toContain("MANAGE चाहिए");
    expect(partial).toContain("WA_REGISTER_PIN सेट नहीं है");
  });
});
