import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { graphBase, graphErrorSummary } from "./webhook-diagnostics.js";

const TIMEOUT_MS = 10_000;

/**
 * Startup self-checks for the WhatsApp integration. Everything here only logs:
 * a failure is a warning, never a crash, and the access token is never logged.
 *
 * 1. Config: which WA_* settings are present (booleans only).
 * 2. Token: GET /{WA_PHONE_NUMBER_ID}?fields=display_phone_number.
 * 3. Subscription: a Meta app only receives real (non-"Test") webhooks for a
 *    WhatsApp Business Account that has subscribed it. Checks
 *    GET /{WA_WABA_ID}/subscribed_apps and, if this app is missing, subscribes
 *    it with POST /{WA_WABA_ID}/subscribed_apps.
 */
@Injectable()
export class WhatsappBootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger("WhatsappStartup");

  onApplicationBootstrap(): void {
    // Not awaited: Graph API latency must never delay the server starting.
    void this.runChecks().catch((e) => this.log.warn(`startup checks failed: ${e?.message ?? e}`));
  }

  async runChecks(): Promise<void> {
    const env = process.env;
    this.log.log(
      `config appSecret=${!!env.WA_APP_SECRET} verifyToken=${!!env.WA_VERIFY_TOKEN} accessToken=${!!env.WA_ACCESS_TOKEN} ` +
        `phoneNumberId=${!!env.WA_PHONE_NUMBER_ID} wabaId=${!!env.WA_WABA_ID} defaultOrg=${!!env.WA_DEFAULT_ORG_ID}`,
    );
    if (!env.WA_ACCESS_TOKEN) {
      this.log.warn("WA_ACCESS_TOKEN not set; skipping token and subscription checks");
      return;
    }
    await this.checkToken();
    await this.ensureSubscribed();
  }

  async checkToken(): Promise<boolean> {
    const phoneId = process.env.WA_PHONE_NUMBER_ID;
    if (!phoneId) {
      this.log.warn("WA_PHONE_NUMBER_ID not set; skipping token check");
      return false;
    }
    try {
      const res = await this.graph("GET", `/${phoneId}?fields=display_phone_number`);
      if (!res.ok) {
        this.log.warn(`token check failed: ${await graphErrorSummary(res)}`);
        return false;
      }
      const body = (await res.json()) as { display_phone_number?: string };
      this.log.log(`token ok (phone number ${body.display_phone_number ?? "?"})`);
      return true;
    } catch (e: any) {
      this.log.warn(`token check failed: ${e?.name ?? "error"} ${e?.message ?? ""}`.trim());
      return false;
    }
  }

  /** Returns true when this app is (or has just been) subscribed to the WABA. */
  async ensureSubscribed(): Promise<boolean> {
    const wabaId = process.env.WA_WABA_ID;
    if (!wabaId) {
      this.log.warn("WA_WABA_ID not set; cannot check webhook subscription (real messages need the WABA subscribed to this app)");
      return false;
    }
    try {
      const appId = await this.ownAppId();
      const listRes = await this.graph("GET", `/${wabaId}/subscribed_apps`);
      if (!listRes.ok) {
        this.log.warn(`subscribed_apps check failed: ${await graphErrorSummary(listRes)}`);
        return false;
      }
      const list = ((await listRes.json()) as { data?: any[] }).data ?? [];
      const ids = list.map((d) => String(d?.whatsapp_business_api_data?.id ?? d?.id ?? "")).filter(Boolean);
      if (appId && ids.includes(appId)) {
        this.log.log(`WABA subscription ok (app ${appId} subscribed; ${ids.length} app(s) total)`);
        return true;
      }
      this.log.warn(
        appId
          ? `app ${appId} is NOT subscribed to the WABA (subscribed: ${ids.join(",") || "none"}); subscribing`
          : `could not determine this app's id (subscribed: ${ids.join(",") || "none"}); subscribing (idempotent)`,
      );
      const subRes = await this.graph("POST", `/${wabaId}/subscribed_apps`);
      if (!subRes.ok) {
        this.log.warn(`subscribe failed: ${await graphErrorSummary(subRes)}`);
        return false;
      }
      const ok = ((await subRes.json()) as { success?: boolean }).success === true;
      if (ok) this.log.log("subscribed app to WABA: success=true");
      else this.log.warn("subscribe returned success=false");
      return ok;
    } catch (e: any) {
      this.log.warn(`subscription check failed: ${e?.name ?? "error"} ${e?.message ?? ""}`.trim());
      return false;
    }
  }

  /** The Meta app this token belongs to (WA_APP_ID overrides the lookup). */
  private async ownAppId(): Promise<string | null> {
    if (process.env.WA_APP_ID) return process.env.WA_APP_ID;
    try {
      const res = await this.graph("GET", "/app");
      if (!res.ok) return null;
      return ((await res.json()) as { id?: string }).id ?? null;
    } catch {
      return null;
    }
  }

  private graph(method: "GET" | "POST", path: string): Promise<Response> {
    return fetch(`${graphBase()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}
