import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { WaConnectionReport, WaGraphRead, WaMetaError, WaTestMessageResult } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { ownerNumbers } from "./owner-assistant.service.js";
import { cleanMetaText, connectionStats, graphBase, maskPhone, metaErrorOf, recordOutbound } from "./webhook-diagnostics.js";

const TIMEOUT_MS = 12_000;
const PHONE_FIELDS = [
  "display_phone_number",
  "verified_name",
  "name_status",
  "code_verification_status",
  "status",
  "platform_type",
  "account_mode",
  "quality_rating",
  "throughput",
  "webhook_configuration",
];
const WABA_FIELDS = ["name", "account_review_status", "business_verification_status", "ownership_type", "on_behalf_of_business_info"];
export const WEBHOOK_PATH = "/api/v1/whatsapp/webhook";

/** Only plain values, shown as they are; nothing that looks like a token. */
function safe(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return /EAA[A-Za-z0-9]{10,}/.test(v) ? "[hidden]" : v.slice(0, 300);
  if (Array.isArray(v)) return depth > 3 ? "[…]" : v.slice(0, 20).map((x) => safe(x, depth + 1));
  if (typeof v === "object") {
    if (depth > 3) return "[…]";
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !/token|secret|password/i.test(k))
        .map(([k, x]) => [k, safe(x, depth + 1)]),
    );
  }
  return null;
}

/**
 * Plain-language findings from a report (pure). Most decisive first: missing
 * config, this app not subscribed, 'messages' not subscribed, the webhook sent
 * elsewhere (override), number not on Cloud API, no webhook since start.
 */
export function connectionFindings(r: Omit<WaConnectionReport, "findings">, now = new Date()): string[] {
  const out: string[] = [];
  const c = r.config;
  if (!c.accessToken || !c.phoneNumberId || !c.wabaId) out.push("❌ WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID / WA_WABA_ID में से कुछ सेट नहीं है।");
  if (!c.appSecret) out.push("❌ WA_APP_SECRET सेट नहीं — हर webhook signature की वजह से रद्द होगा।");
  const apps = r.subscribedApps.data?.apps ?? [];
  if (r.subscribedApps.ok) {
    if (!apps.some((a) => a.isThisApp)) out.push(`❌ हमारा app (${c.appId ?? "?"}) इस WABA से जुड़ा (subscribed) नहीं है — "दोबारा जोड़ें" दबाएँ।`);
    const ours = apps.find((a) => a.isThisApp);
    if (ours?.overrideCallback && !ours.overrideCallback.includes(WEBHOOK_PATH)) out.push(`❌ इस WABA पर हमारे app का webhook दूसरे पते पर भेजा जा रहा है (override): ${ours.overrideCallback}`);
    const others = apps.filter((a) => !a.isThisApp);
    if (others.length) out.push(`ℹ️ इस WABA से दूसरे app भी जुड़े हैं: ${others.map((a) => a.name ?? a.id).join(", ")} — उन्हें भी हर संदेश मिलता है; वे हमारे app को नहीं रोकते, पर नंबर का override (नीचे) देखें।`);
  } else if (r.subscribedApps.error) out.push(`❌ WABA की subscribed apps सूची नहीं मिली (कोड ${r.subscribedApps.error.code ?? r.subscribedApps.error.http}) — token को इस WABA की अनुमति नहीं है?`);

  const p = (r.phone.data ?? {}) as Record<string, any>;
  if (r.phone.ok) {
    if (p.platform_type && p.platform_type !== "CLOUD_API") out.push(`❌ नंबर Cloud API पर नहीं है (platform_type=${p.platform_type}) — Cloud API पर register करना होगा, तब तक संदेश हमारे पास नहीं आएँगे।`);
    if (p.status && p.status !== "CONNECTED") out.push(`⚠️ नंबर की स्थिति ${p.status} है (CONNECTED होनी चाहिए)।`);
    if (p.code_verification_status && p.code_verification_status !== "VERIFIED") out.push(`⚠️ नंबर का कोड सत्यापन: ${p.code_verification_status}।`);
    if (p.account_mode === "SANDBOX") out.push("⚠️ नंबर SANDBOX (टेस्ट) मोड में है।");
    const wc = (p.webhook_configuration ?? {}) as Record<string, string>;
    for (const [level, url] of Object.entries(wc)) {
      if (level !== "application" && url && !String(url).includes(WEBHOOK_PATH)) out.push(`❌ नंबर/WABA स्तर पर webhook override (${level}) दूसरे पते पर है: ${url} — इस नंबर के संदेश वहीं जा रहे हैं।`);
    }
    if (wc.application && !String(wc.application).includes(WEBHOOK_PATH)) out.push(`❌ App का webhook पता हमारे सर्वर का नहीं है: ${wc.application}`);
  } else if (r.phone.error) out.push(`❌ नंबर (WA_PHONE_NUMBER_ID) पढ़ा नहीं जा सका (कोड ${r.phone.error.code ?? r.phone.error.http}) — ID या token की अनुमति गलत?`);

  if (r.appSubscriptions.ok) {
    const wa = (r.appSubscriptions.data ?? []).find((s) => s.object === "whatsapp_business_account");
    if (!wa) out.push("❌ App Dashboard → WhatsApp → Configuration में webhook (whatsapp_business_account) सेट नहीं है।");
    else {
      if (!wa.fields.includes("messages")) out.push('❌ App के webhook में "messages" field subscribe नहीं है — App Dashboard → WhatsApp → Configuration → Webhook fields → messages → Subscribe।');
      if (wa.callbackUrl && !wa.callbackUrl.includes(WEBHOOK_PATH)) out.push(`❌ App का Callback URL हमारे सर्वर का नहीं है: ${wa.callbackUrl}`);
      if (!wa.active) out.push("❌ App का webhook subscription active नहीं है।");
    }
  }

  const w = r.webhook;
  const upMin = (now.getTime() - Date.parse(w.startedAt)) / 60000;
  if (w.invalidSignature > 0 && w.lastSignatureOk === false) out.push(`❌ Webhook आ रहे हैं पर signature गलत (${w.lastInvalidReason ?? "?"}) — WA_APP_SECRET उसी app (${c.appId ?? "?"}) का होना चाहिए।`);
  if (w.posts === 0 && upMin > 30) {
    out.push(
      `⚠️ सर्वर ${Math.round(upMin / 60)} घंटे से चालू है पर Meta से एक भी webhook नहीं आया। ऊपर सब ठीक हो तो: Meta App Dashboard में app "Live" (Published) मोड में हो — Development मोड में असली नंबर के संदेश के webhook नहीं आते — और app उसी business portfolio से जुड़ा हो जिसका WABA है।`,
    );
  }
  if (r.lastOutbound && !r.lastOutbound.ok && r.lastOutbound.error) {
    const e = r.lastOutbound.error;
    out.push(`⚠️ आख़िरी भेजा गया संदेश असफल: कोड ${e.code ?? e.http ?? "-"}${e.subcode ? `/${e.subcode}` : ""} ${e.title ?? ""} ${e.message ?? ""}`.trim());
  }
  if (!out.some((f) => f.startsWith("❌"))) out.unshift("✅ जाँच में कोई साफ़ गड़बड़ी नहीं मिली।");
  return out;
}

/**
 * OWNER: "WhatsApp connection check" -- what Meta says about the number, the
 * WABA, the subscribed apps and this app's webhook, plus what this server has
 * seen. Tokens and secrets are never returned or logged.
 */
@Injectable()
export class WaConnectionService {
  private readonly log = new Logger("WhatsappConnection");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private owner() {
    const t = requireTenantContext(this.cls);
    if (t.role !== "OWNER") throw new ForbiddenException("केवल मालिक।");
    return t;
  }

  private async read(path: string, token: string | undefined): Promise<WaGraphRead<any>> {
    if (!token) return { ok: false, data: null, error: { http: null, code: null, subcode: null, type: null, title: null, message: "token सेट नहीं", details: null } };
    try {
      const res = await fetch(`${graphBase()}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const json: any = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, data: null, error: metaErrorOf(json, res.status) };
      return { ok: true, data: json, error: null };
    } catch (e: any) {
      return { ok: false, data: null, error: { http: null, code: null, subcode: null, type: null, title: null, message: cleanMetaText(e?.message) ?? "network error", details: null } };
    }
  }

  private async appId(): Promise<string | null> {
    if (process.env.WA_APP_ID) return process.env.WA_APP_ID;
    const r = await this.read("/app?fields=id", process.env.WA_ACCESS_TOKEN);
    return (r.data?.id as string | undefined) ?? null;
  }

  async check(now = new Date()): Promise<WaConnectionReport> {
    this.owner();
    const env = process.env;
    const token = env.WA_ACCESS_TOKEN;
    const phoneId = env.WA_PHONE_NUMBER_ID ?? null;
    const wabaId = env.WA_WABA_ID ?? null;
    const appId = await this.appId();

    const subs = wabaId ? await this.read(`/${wabaId}/subscribed_apps`, token) : { ok: false, data: null, error: null };
    const subscribedApps: WaConnectionReport["subscribedApps"] = subs.ok
      ? {
          ok: true,
          error: null,
          data: {
            apps: ((subs.data?.data ?? []) as any[]).map((d) => {
              const a = d?.whatsapp_business_api_data ?? d ?? {};
              const id = String(a.id ?? "");
              return { id, name: a.name ?? null, link: a.link ?? null, overrideCallback: d?.override_callback_uri ?? null, isThisApp: !!appId && id === appId };
            }),
          },
        }
      : { ok: false, data: null, error: subs.error };

    let phone = phoneId ? await this.read(`/${phoneId}?fields=${PHONE_FIELDS.join(",")}`, token) : { ok: false, data: null, error: null };
    // A field this API version does not know → read the basic ones.
    if (!phone.ok && phone.error?.code === 100 && phoneId) phone = await this.read(`/${phoneId}?fields=${PHONE_FIELDS.slice(0, 8).join(",")}`, token);
    const waba = wabaId ? await this.read(`/${wabaId}?fields=${WABA_FIELDS.join(",")}`, token) : { ok: false, data: null, error: null };

    // App token (APP_ID|APP_SECRET) -- only sent to Meta, never shown.
    const appToken = appId && env.WA_APP_SECRET ? `${appId}|${env.WA_APP_SECRET}` : undefined;
    const subsApp = appId ? await this.read(`/${appId}/subscriptions`, appToken) : { ok: false, data: null, error: null };
    const appSubscriptions: WaConnectionReport["appSubscriptions"] = subsApp.ok
      ? {
          ok: true,
          error: null,
          data: ((subsApp.data?.data ?? []) as any[]).map((s) => ({
            object: String(s.object ?? ""),
            callbackUrl: s.callback_url ?? null,
            active: s.active !== false,
            fields: ((s.fields ?? []) as any[]).map((f) => String(f?.name ?? f)),
          })),
        }
      : { ok: false, data: null, error: subsApp.error };

    const last = await this.prisma.waInboundMessage.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null);
    const st = connectionStats();
    const report: Omit<WaConnectionReport, "findings"> = {
      checkedAt: now.toISOString(),
      config: {
        graphVersion: graphBase().split("/").pop() ?? "",
        phoneNumberId: phoneId,
        wabaId,
        appId,
        accessToken: !!token,
        appSecret: !!env.WA_APP_SECRET,
        verifyToken: !!env.WA_VERIFY_TOKEN,
        ownerNumbers: ownerNumbers().length,
      },
      subscribedApps,
      phone: { ok: phone.ok, data: phone.ok ? (safe(phone.data) as Record<string, unknown>) : null, error: phone.error },
      waba: { ok: waba.ok, data: waba.ok ? (safe(waba.data) as Record<string, unknown>) : null, error: waba.error },
      appSubscriptions,
      webhook: { ...st.webhook, lastStoredMessageAt: last?.createdAt.toISOString() ?? null },
      lastOutbound: st.outbound,
    };
    const findings = connectionFindings(report, now);
    this.log.log(`connection check: ${findings.filter((f) => f.startsWith("❌")).length} problem(s); webhooks since start ${st.webhook.posts}`);
    return { ...report, findings };
  }

  /** OWNER: a free-form text to the owner's own number, with Meta's full answer. */
  async testMessage(): Promise<WaTestMessageResult> {
    this.owner();
    const to = ownerNumbers()[0];
    if (!to) throw new BadRequestException("WA_OWNER_NUMBERS सेट नहीं है।");
    if (!process.env.WA_ACCESS_TOKEN || !process.env.WA_PHONE_NUMBER_ID) throw new BadRequestException("WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID सेट नहीं है।");
    try {
      const res = await fetch(`${graphBase()}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: "✅ नागरिक सेवा केंद्र: WhatsApp कनेक्शन जाँच का टेस्ट संदेश।" } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json: any = await res.json().catch(() => null);
      if (res.ok) {
        recordOutbound("test", true, null);
        this.log.log(`test message to ${maskPhone(to)}: sent`);
        return { ok: true, to: maskPhone(to), wamid: json?.messages?.[0]?.id ?? null, error: null, hint: "Meta ने संदेश ले लिया। फ़ोन पर न आए तो नंबर की स्थिति / quality देखें।" };
      }
      const error = metaErrorOf(json, res.status);
      recordOutbound("test", false, error);
      this.log.warn(`test message to ${maskPhone(to)}: code=${error.code ?? "-"} subcode=${error.subcode ?? "-"}`);
      return { ok: false, to: maskPhone(to), wamid: null, error, hint: testHint(error) };
    } catch (e: any) {
      const error: WaMetaError = { http: null, code: null, subcode: null, type: null, title: null, message: cleanMetaText(e?.message) ?? "network error", details: null };
      return { ok: false, to: maskPhone(to), wamid: null, error, hint: null };
    }
  }

  /** OWNER: subscribe this app to the WABA again (optionally sending its webhooks to this server's URL). */
  async resubscribe(callbackUrl: string | null): Promise<WaGraphRead> {
    this.owner();
    const waba = process.env.WA_WABA_ID;
    const token = process.env.WA_ACCESS_TOKEN;
    if (!waba || !token) throw new BadRequestException("WA_WABA_ID / WA_ACCESS_TOKEN सेट नहीं है।");
    const body = callbackUrl && process.env.WA_VERIFY_TOKEN ? { override_callback_uri: callbackUrl, verify_token: process.env.WA_VERIFY_TOKEN } : {};
    try {
      const res = await fetch(`${graphBase()}/${waba}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json: any = await res.json().catch(() => null);
      this.log.log(`resubscribe${callbackUrl ? " with override" : ""}: http=${res.status}`);
      return res.ok ? { ok: true, data: { success: json?.success === true }, error: null } : { ok: false, data: null, error: metaErrorOf(json, res.status) };
    } catch (e: any) {
      return { ok: false, data: null, error: { http: null, code: null, subcode: null, type: null, title: null, message: cleanMetaText(e?.message) ?? "network error", details: null } };
    }
  }
}

/** What a failed test send means, in Hindi. */
export function testHint(e: WaMetaError): string | null {
  switch (e.code) {
    case 131047:
      return "24 घंटे की विंडो बंद: Meta को पिछले 24 घंटे में मालिक के नंबर से कोई संदेश नहीं मिला। मालिक के नंबर से इस बिज़नेस नंबर पर 'Hi' भेजें और फिर से टेस्ट करें — अगर तब भी यही आए तो 'Hi' Meta (Cloud API) तक पहुँच ही नहीं रहा (नंबर दूसरे प्लेटफ़ॉर्म/AiSensy पर है)।";
    case 131030:
      return "मालिक का नंबर इस बिज़नेस नंबर की अनुमत सूची में नहीं है (टेस्ट/development मोड)।";
    case 190:
      return "Access token अमान्य / समाप्त — नया system-user token डालें।";
    case 10:
    case 200:
      return "Token को इस नंबर/WABA की अनुमति (whatsapp_business_messaging) नहीं है।";
    case 133010:
      return "नंबर Cloud API पर register नहीं है।";
    case 131031:
      return "बिज़नेस अकाउंट लॉक/प्रतिबंधित है।";
    default:
      return null;
  }
}
