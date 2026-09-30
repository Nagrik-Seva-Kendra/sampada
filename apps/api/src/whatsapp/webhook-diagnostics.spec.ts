import { createHmac } from "node:crypto";
import { ForbiddenException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSignature, formatPayloadSummary, graphErrorSummary, maskPhone, summarizePayload } from "./webhook-diagnostics.js";
import { WhatsappBootstrapService } from "./whatsapp-bootstrap.service.js";
import { WhatsappController } from "./whatsapp.controller.js";
import { WhatsappService } from "./whatsapp.service.js";

const TOKEN = "EAAG-secret-token-value";
const SECRET = "app-secret";
const MESSAGE_TEXT = "मेरा आधार 234567890123 है";

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ profile: { name: "Ram" } }],
            messages: [
              { id: "wamid.1", from: "919876543210", type: "text", text: { body: MESSAGE_TEXT } },
              { id: "wamid.2", from: "919876543210", type: "image", image: { id: "m1" } },
            ],
            statuses: [{ id: "s1" }, { id: "s2" }],
          },
        },
      ],
    },
  ],
};

const sign = (raw: Buffer, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Everything written through Nest's Logger during a test, joined. */
let logged: string[] = [];
beforeEach(() => {
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("payload summary", () => {
  it("counts entries, message types and statuses without any content", () => {
    const s = summarizePayload(payload);
    expect(s).toEqual({
      object: "whatsapp_business_account",
      entries: 1,
      messages: 2,
      messageTypes: ["text", "image"],
      statuses: 2,
    });
    const line = formatPayloadSummary(s);
    expect(line).toBe("object=whatsapp_business_account entries=1 messages=2 types=text,image statuses=2");
    expect(line).not.toContain("919876543210");
  });

  it("tolerates junk bodies", () => {
    expect(summarizePayload(undefined)).toEqual({ object: "(none)", entries: 0, messages: 0, messageTypes: [], statuses: 0 });
    expect(summarizePayload({ entry: [{ changes: [{}] }] }).entries).toBe(1);
  });

  it("masks phone numbers", () => {
    expect(maskPhone("919876543210")).toBe("********3210");
    expect(maskPhone(undefined)).toBe("-");
  });
});

describe("checkSignature", () => {
  const raw = Buffer.from(JSON.stringify(payload));
  it("accepts a correct HMAC", () => expect(checkSignature(SECRET, raw, sign(raw))).toEqual({ ok: true }));
  it("explains why a signature is rejected", () => {
    expect(checkSignature(undefined, raw, sign(raw))).toEqual({ ok: false, reason: "no_app_secret" });
    expect(checkSignature(SECRET, undefined, sign(raw))).toEqual({ ok: false, reason: "no_raw_body" });
    expect(checkSignature(SECRET, raw, undefined)).toEqual({ ok: false, reason: "missing_header" });
    expect(checkSignature(SECRET, raw, sign(raw, "other"))).toEqual({ ok: false, reason: "mismatch" });
  });
});

describe("graphErrorSummary", () => {
  it("keeps only Meta's error fields", async () => {
    const res = json(401, { error: { message: "Error validating access token", type: "OAuthException", code: 190, error_subcode: 463 } });
    expect(await graphErrorSummary(res)).toBe('http=401 code=190 subcode=463 type=OAuthException message="Error validating access token"');
    expect(await graphErrorSummary(new Response("<html>", { status: 502 }))).toBe("http=502");
  });
});

describe("WhatsappController POST logging", () => {
  const raw = Buffer.from(JSON.stringify(payload));

  it("logs a summary line and rejects an invalid signature with a warning", () => {
    vi.stubEnv("WA_APP_SECRET", SECRET);
    const wa = new WhatsappService({} as any, {} as any, { touchContact: async () => undefined } as any);
    const handle = vi.spyOn(wa, "handlePayload").mockResolvedValue();
    const ctrl = new WhatsappController(wa);
    expect(() => ctrl.receive({ rawBody: raw, body: payload } as any, sign(raw, "wrong"))).toThrow(ForbiddenException);
    expect(logged).toContain(
      "warn: webhook POST signature=invalid reason=mismatch object=whatsapp_business_account entries=1 messages=2 types=text,image statuses=2",
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it("logs a valid delivery and never the message text", async () => {
    vi.stubEnv("WA_APP_SECRET", SECRET);
    const wa = new WhatsappService({} as any, {} as any, { touchContact: async () => undefined } as any);
    const handle = vi.spyOn(wa, "handlePayload").mockResolvedValue();
    expect(new WhatsappController(wa).receive({ rawBody: raw, body: payload } as any, sign(raw))).toBe("OK");
    await new Promise((r) => setImmediate(r)); // let the background hand-off run while still mocked
    expect(handle).toHaveBeenCalledWith(payload);
    expect(logged[0]).toMatch(/^log: webhook POST signature=valid object=whatsapp_business_account/);
    expect(logged.join("\n")).not.toContain("234567890123");
  });
});

describe("WhatsappService", () => {
  it("firstTime: a unique violation is a duplicate, any other DB error still processes", async () => {
    const create = vi.fn();
    const wa = new WhatsappService({ waInboundMessage: { create } } as any, {} as any, { touchContact: async () => undefined } as any);

    create.mockResolvedValueOnce({});
    expect(await wa.firstTime("wamid.1")).toBe(true);

    create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    expect(await wa.firstTime("wamid.1")).toBe(false);

    create.mockRejectedValueOnce(Object.assign(new Error("relation does not exist"), { code: "P2021" }));
    expect(await wa.firstTime("wamid.2")).toBe(true);
    expect(logged.some((l) => l.startsWith("error: idempotency check failed for wamid.2 (P2021)"))).toBe(true);
  });

  it("logs handled messages and sent replies without text or token", async () => {
    vi.stubEnv("WA_ACCESS_TOKEN", TOKEN);
    vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
    const fetchMock = vi.fn(async () => json(200, { messages: [{ id: "wamid.out" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const intake = { handleText: vi.fn(async () => ["reply one", "reply two"]) };
    const wa = new WhatsappService({ waInboundMessage: { create: vi.fn(async () => ({})) } } as any, intake as any, { touchContact: async () => undefined } as any);

    await wa.handlePayload({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { messages: [payload.entry[0]!.changes[0]!.value.messages[0]] } }] }],
    });

    expect(logged).toContain("log: sent reply to ********3210 wamid=wamid.out");
    expect(logged).toContain("log: handled message wamid.1 type=text replies=2");
    const all = logged.join("\n");
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain(MESSAGE_TEXT);
  });

  it("logs a failed send with Meta's error code", async () => {
    vi.stubEnv("WA_ACCESS_TOKEN", TOKEN);
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: { code: 190, type: "OAuthException", message: "Session has expired" } })));
    await new WhatsappService({} as any, {} as any, { touchContact: async () => undefined } as any).sendText("919876543210", "hi");
    expect(logged).toContain('error: send failed to ********3210: http=401 code=190 type=OAuthException message="Session has expired"');
  });
});

describe("WhatsappBootstrapService", () => {
  const routes = (map: Record<string, () => Response | Promise<Response>>) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(url).pathname.replace(/^\/v[\d.]+/, "")}${new URL(url).search}`;
      const h = map[key];
      if (!h) throw new Error(`unexpected ${key}`);
      return h();
    });

  beforeEach(() => {
    vi.stubEnv("WA_ACCESS_TOKEN", TOKEN);
    vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
    vi.stubEnv("WA_WABA_ID", "222");
    vi.stubEnv("WA_APP_ID", "");
  });

  it("does nothing but log config when no access token is set", async () => {
    vi.stubEnv("WA_ACCESS_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await new WhatsappBootstrapService().runChecks();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged.some((l) => l.includes("WA_ACCESS_TOKEN not set"))).toBe(true);
  });

  it("reports token ok and leaves an already-subscribed app alone", async () => {
    const fetchMock = routes({
      "GET /111?fields=display_phone_number": () => json(200, { display_phone_number: "+1 555-140-9523", id: "111" }),
      "GET /app": () => json(200, { id: "999" }),
      "GET /222/subscribed_apps": () => json(200, { data: [{ whatsapp_business_api_data: { id: "999", name: "NSK" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await new WhatsappBootstrapService().runChecks();
    expect(logged).toContain("log: token ok (phone number +1 555-140-9523)");
    expect(logged).toContain("log: WABA subscription ok (app 999 subscribed; 1 app(s) total)");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("subscribes the app when the WABA has not subscribed it", async () => {
    const fetchMock = routes({
      "GET /111?fields=display_phone_number": () => json(200, { display_phone_number: "+1 555-140-9523" }),
      "GET /app": () => json(200, { id: "999" }),
      "GET /222/subscribed_apps": () => json(200, { data: [] }),
      "POST /222/subscribed_apps": () => json(200, { success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await new WhatsappBootstrapService().runChecks();
    expect(logged).toContain("warn: app 999 is NOT subscribed to the WABA (subscribed: none); subscribing");
    expect(logged).toContain("log: subscribed app to WABA: success=true");
    // Token only ever travels in the Authorization header, never in a URL or log line.
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).not.toContain(TOKEN);
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    }
    expect(logged.join("\n")).not.toContain(TOKEN);
  });

  it("only warns on Graph errors and network failures", async () => {
    vi.stubGlobal(
      "fetch",
      routes({
        "GET /111?fields=display_phone_number": () =>
          json(401, { error: { code: 190, type: "OAuthException", message: "Error validating access token" } }),
        "GET /app": () => {
          throw new TypeError("fetch failed");
        },
        "GET /222/subscribed_apps": () => {
          throw new TypeError("fetch failed");
        },
      }),
    );
    const svc = new WhatsappBootstrapService();
    await expect(svc.runChecks()).resolves.toBeUndefined();
    expect(logged).toContain('warn: token check failed: http=401 code=190 type=OAuthException message="Error validating access token"');
    expect(logged).toContain("warn: subscription check failed: TypeError fetch failed");
    expect(logged.some((l) => l.startsWith("error:"))).toBe(false);
  });

  it("warns when WA_WABA_ID is missing", async () => {
    vi.stubEnv("WA_WABA_ID", "");
    vi.stubGlobal("fetch", routes({ "GET /111?fields=display_phone_number": () => json(200, { display_phone_number: "x" }) }));
    expect(await new WhatsappBootstrapService().ensureSubscribed()).toBe(false);
    expect(logged.some((l) => l.startsWith("warn: WA_WABA_ID not set"))).toBe(true);
  });
});
