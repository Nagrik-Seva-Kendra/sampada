import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { WaConnectionReport, WaGraphRead, WaMetaError, WaRegisterResult, WaRegistrationInfo, WaTestMessageResult, WaTokenInfo } from "@sampada/shared";
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
export function connectionFindings(r: Omit<WaConnectionReport, "findings" | "token" | "registration">, now = new Date()): string[] {
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

const MESSAGING = "whatsapp_business_messaging";
const MANAGEMENT = "whatsapp_business_management";
const str = (v: unknown, max = 200): string | null => (v == null || v === "" ? null : String(v).slice(0, max));
/** Meta's unix seconds → ISO; 0 means "never". */
const unixTime = (v: unknown): string | null => (typeof v !== "number" ? null : v === 0 ? "never" : new Date(v * 1000).toISOString());

/** The safe part of a /debug_token answer: no token, no secret. */
export function tokenDebugOf(json: any): NonNullable<WaTokenInfo["debug"]["data"]> {
  const d = json?.data ?? {};
  const ids = (x: unknown) => (Array.isArray(x) ? x.slice(0, 50).map((i) => String(i)) : null);
  return {
    isValid: typeof d.is_valid === "boolean" ? d.is_valid : null,
    type: str(d.type, 40),
    appId: str(d.app_id, 40),
    application: str(d.application),
    userId: str(d.user_id, 40),
    expiresAt: unixTime(d.expires_at),
    dataAccessExpiresAt: unixTime(d.data_access_expires_at),
    scopes: Array.isArray(d.scopes) ? d.scopes.slice(0, 60).map((x: unknown) => String(x)) : [],
    granularScopes: Array.isArray(d.granular_scopes) ? d.granular_scopes.slice(0, 60).map((g: any) => ({ scope: String(g?.scope ?? ""), targetIds: ids(g?.target_ids) })) : [],
    error: d.error ? { code: d.error.code ?? null, subcode: d.error.subcode ?? null, message: cleanMetaText(d.error.message) ?? null } : null,
  };
}

/**
 * Plain-language verdicts on what the token may do (pure): (d) invalid /
 * expired, (c) another app's token, (a) no whatsapp_business_messaging,
 * (b) messaging granted but not for this WABA / number, then portfolios.
 */
export function tokenVerdicts(
  t: Omit<WaTokenInfo, "verdicts">,
  cfg: { appId: string | null; wabaId: string | null; phoneNumberId: string | null },
  now = new Date(),
): string[] {
  const out: string[] = [];
  if (!t.length) return ["❌ WA_ACCESS_TOKEN सेट नहीं है। / WA_ACCESS_TOKEN is not set."];
  const d = t.debug.data;
  if (!t.debug.ok || !d) {
    const e = t.debug.error;
    out.push(`⚠️ Token की जाँच (debug_token) नहीं हो सकी${e ? ` (कोड ${e.code ?? e.http ?? "-"}: ${e.message ?? ""})` : ""} — WA_APP_ID / WA_APP_SECRET सही हैं? / Could not debug the token.`);
    return out;
  }
  const expired = d.expiresAt && d.expiresAt !== "never" && Date.parse(d.expiresAt) <= now.getTime();
  if (d.isValid === false || expired) {
    out.push(
      `❌ (d) Token अमान्य या समाप्त है${d.error?.message ? `: ${d.error.message}` : ""} — Coolify में नया token डालें। / Token is invalid or expired.`,
    );
  }
  if (cfg.appId && d.appId && d.appId !== cfg.appId) {
    out.push(`❌ (c) यह token दूसरे app (${d.appId}${d.application ? ` "${d.application}"` : ""}) का है, हमारे app ${cfg.appId} का नहीं। / Token belongs to app ${d.appId}, not ${cfg.appId}.`);
  }
  if (!d.scopes.includes(MESSAGING)) {
    out.push(`❌ (a) Token में ${MESSAGING} अनुमति नहीं है — system user का token बनाते समय यह permission चुनें। / Token lacks ${MESSAGING}.`);
  } else {
    const g = d.granularScopes.find((x) => x.scope === MESSAGING);
    const targets = g?.targetIds;
    const ours = [cfg.wabaId, cfg.phoneNumberId].filter((x): x is string => !!x);
    if (targets && targets.length && ours.length && !ours.some((id) => targets.includes(id))) {
      out.push(
        `❌ (b) ${MESSAGING} सिर्फ़ इन assets के लिए है: ${targets.join(", ")} — हमारा WABA ${cfg.wabaId ?? "?"} / नंबर ${cfg.phoneNumberId ?? "?"} इनमें नहीं। Business Settings → System users → Assign assets में यह WABA (Full control) जोड़कर नया token बनाएँ। / ${MESSAGING} is not granted for this WABA.`,
      );
    }
  }
  if (!d.scopes.includes(MANAGEMENT)) out.push(`⚠️ Token में ${MANAGEMENT} नहीं है — WABA / templates पढ़े नहीं जा सकेंगे। / Token lacks ${MANAGEMENT}.`);
  if (d.type && d.type !== "SYSTEM_USER") out.push(`⚠️ Token का प्रकार ${d.type} है (SYSTEM_USER होना चाहिए) — यह जल्दी समाप्त हो सकता है। / Not a system-user token.`);
  const wabaBiz = t.wabaOwner.data?.ownerBusinessId;
  const appBiz = t.app.data?.ownerBusinessId;
  if (wabaBiz && appBiz && wabaBiz !== appBiz) {
    out.push(
      `⚠️ App (${t.app.data?.id ?? cfg.appId}) business ${appBiz} में है और WABA business ${wabaBiz} में — अलग portfolios। System user उसी portfolio का हो जिसका WABA है, या WABA को app वाले portfolio के साथ share करें। / App and WABA are in different portfolios.`,
    );
  } else if (wabaBiz && !appBiz) {
    out.push(`ℹ️ WABA business ${wabaBiz} का है; app का business owner token से पढ़ा नहीं जा सका — Meta App Dashboard → Settings → Basic में देखें। / App owner not readable.`);
  }
  if (!out.some((v) => v.startsWith("❌"))) {
    out.unshift(`✅ Token मान्य है और इसमें ${MESSAGING} इस WABA के लिए है। फिर भी (#200) आए तो Coolify में token का आख़िरी हिस्सा (…${t.tail ?? ""}) Meta वाले नए token से मिलाएँ। / Token looks right.`);
  }
  return out;
}

/** WA_REGISTER_PIN, only when it is exactly 6 digits. */
function registerPin(): string | null {
  const pin = process.env.WA_REGISTER_PIN?.trim();
  return pin && /^\d{6}$/.test(pin) ? pin : null;
}

/** A Meta error with every copy of the PIN removed. */
function withoutPin(e: WaMetaError, pin: string): WaMetaError {
  const hide = (v: string | null) => (v ? v.split(pin).join("[pin]") : v);
  return { ...e, type: hide(e.type), title: hide(e.title), message: hide(e.message), details: hide(e.details) };
}

/**
 * Verdicts on registration and WABA access (pure): number not on Cloud API /
 * not connected → register; PIN set or not; the token's system user missing
 * from the WABA's assigned users, or without full control.
 */
export function registrationVerdicts(r: Omit<WaRegistrationInfo, "verdicts">, tokenUserId: string | null): string[] {
  const out: string[] = [];
  const p = r.phone.data;
  if (r.phone.ok && p) {
    if (p.platformType && p.platformType !== "CLOUD_API") {
      out.push(`❌ नंबर इस app पर Cloud API में register नहीं है (platform_type=${p.platformType}) — "Register number on this app" दबाएँ। / Number is not registered on Cloud API.`);
    } else if (p.status && p.status !== "CONNECTED") {
      out.push(`❌ नंबर की स्थिति ${p.status} है (CONNECTED होनी चाहिए) — "Register number on this app" दबाएँ। / Number status is ${p.status}; register it.`);
    }
    if (p.codeVerificationStatus && p.codeVerificationStatus !== "VERIFIED") {
      out.push(`ℹ️ code_verification_status=${p.codeVerificationStatus} — पुराने (AiSensy) setup का OTP सत्यापन; register करने पर Meta PIN माँगेगा। / Code verification ${p.codeVerificationStatus}.`);
    }
    if (p.isPinEnabled === true) out.push("ℹ️ नंबर पर two-step PIN पहले से लगा है — WA_REGISTER_PIN में वही PIN होना चाहिए (याद न हो तो WhatsApp Manager → Phone numbers → Two-step verification में बदलें)। / Two-step PIN is already set.");
    if (p.isPinEnabled === false) out.push("ℹ️ नंबर पर अभी two-step PIN नहीं है — register करने पर WA_REGISTER_PIN वाला PIN लग जाएगा। / No two-step PIN yet; register sets it.");
  } else if (r.phone.error) {
    out.push(`⚠️ नंबर की registration स्थिति पढ़ी नहीं जा सकी (कोड ${r.phone.error.code ?? r.phone.error.http ?? "-"}: ${r.phone.error.message ?? ""})। / Could not read registration status.`);
  }
  if (!r.pinConfigured) out.push("⚠️ WA_REGISTER_PIN सेट नहीं है (या 6 अंक का नहीं) — register बटन के लिए Coolify में यह env डालकर API redeploy करें। / WA_REGISTER_PIN is not set.");

  const users = r.assignedUsers.data;
  if (r.assignedUsers.ok && users) {
    const me = users.find((u) => u.isTokenUser);
    if (tokenUserId && !me) {
      out.push(
        `❌ Token वाला system user (${tokenUserId}) इस WABA के assigned users में नहीं है (${users.map((u) => u.name ?? u.id).join(", ") || "कोई नहीं"}) — Business Settings → System users → Assign assets → यह WABA → Full control। / The token's system user is not assigned to this WABA.`,
      );
    } else if (me && !me.tasks.includes("MANAGE")) {
      out.push(`⚠️ System user को WABA पर सिर्फ़ ये अधिकार हैं: ${me.tasks.join(", ") || "—"} (Full control = MANAGE चाहिए)। / System user lacks full control.`);
    } else if (me) {
      out.push(`✅ System user (${me.name ?? me.id}) इस WABA पर assigned है: ${me.tasks.join(", ")}। / System user is assigned.`);
    }
  } else if (r.assignedUsers.error) {
    out.push(`⚠️ WABA के assigned users पढ़े नहीं जा सके (कोड ${r.assignedUsers.error.code ?? r.assignedUsers.error.http ?? "-"}: ${r.assignedUsers.error.message ?? ""})। / Could not read assigned users.`);
  }
  return out;
}

/** What a failed register means, in Hindi. */
export function registerHint(e: WaMetaError): string | null {
  switch (e.code) {
    case 133005:
      return "Two-step PIN गलत है: इस नंबर पर पहले से two-step verification PIN लगा है — WA_REGISTER_PIN में वही 6 अंक का PIN डालें (याद न हो तो WhatsApp Manager → Phone numbers → Settings → Two-step verification में PIN बदलें, फिर env बदलकर redeploy करें)।";
    case 133006:
      return "नंबर का सत्यापन (OTP) ज़रूरी है: WhatsApp Manager में इस नंबर को SMS/कॉल कोड से verify करें, फिर register दोबारा दबाएँ।";
    case 133008:
    case 133009:
      return "PIN की बहुत ज़्यादा / बहुत तेज़ कोशिशें — Meta के बताए समय तक रुकें, फिर सही PIN से दोबारा कोशिश करें।";
    case 133016:
      return "बहुत बार register की कोशिश — 72 घंटे की सीमा लगी है; उसके बाद दोबारा करें।";
    case 133015:
      return "नंबर हाल ही में हटाया गया था — Meta के अनुसार कुछ मिनट रुककर दोबारा करें।";
    case 133004:
      return "Meta का सर्वर अभी उपलब्ध नहीं — थोड़ी देर बाद दोबारा करें।";
    case 190:
      return "Access token अमान्य / समाप्त — नया system-user token डालें।";
    case 10:
    case 200:
      return "Token को इस नंबर/WABA पर register की अनुमति नहीं है — system user को WABA पर Full control दें (नीचे assigned users देखें)।";
    case 100:
      return "Meta ने अनुरोध अमान्य बताया — phone number ID (WA_PHONE_NUMBER_ID) और PIN (6 अंक) जाँचें।";
    default:
      return null;
  }
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

  /** debug_token (app token) + WABA and app owners; only safe fields come back. */
  private async tokenInfo(appId: string | null): Promise<WaTokenInfo> {
    const env = process.env;
    const token = env.WA_ACCESS_TOKEN ?? "";
    const wabaId = env.WA_WABA_ID ?? null;
    const appToken = appId && env.WA_APP_SECRET ? `${appId}|${env.WA_APP_SECRET}` : undefined;
    const none = { ok: false, data: null, error: null };

    const dbg = token ? await this.read(`/debug_token?input_token=${encodeURIComponent(token)}`, appToken) : none;
    const debug: WaTokenInfo["debug"] = dbg.ok ? { ok: true, error: null, data: tokenDebugOf(dbg.data) } : { ok: false, data: null, error: dbg.error };

    const w = wabaId ? await this.read(`/${wabaId}?fields=id,name,owner_business_info`, token || undefined) : none;
    const wabaOwner: WaTokenInfo["wabaOwner"] = w.ok
      ? { ok: true, error: null, data: { id: str(w.data?.id, 40), name: str(w.data?.name), ownerBusinessId: str(w.data?.owner_business_info?.id, 40), ownerBusinessName: str(w.data?.owner_business_info?.name) } }
      : { ok: false, data: null, error: w.error };

    let a: WaGraphRead<any> = none;
    if (appId) {
      // owner_business may be unknown to this version or unreadable: fall back to the basic fields, then to the app token.
      for (const [fields, tk] of [["id,name,link,owner_business", token || undefined], ["id,name,link", token || undefined], ["id,name,link,owner_business", appToken]] as const) {
        a = await this.read(`/${appId}?fields=${fields}`, tk);
        if (a.ok) break;
      }
    }
    const app: WaTokenInfo["app"] = a.ok
      ? { ok: true, error: null, data: { id: str(a.data?.id, 40), name: str(a.data?.name), link: str(a.data?.link, 300), ownerBusinessId: str(a.data?.owner_business?.id, 40), ownerBusinessName: str(a.data?.owner_business?.name) } }
      : { ok: false, data: null, error: a.error };

    const info = { tail: token.length >= 12 ? token.slice(-6) : null, length: token.length, debug, wabaOwner, app };
    return { ...info, verdicts: tokenVerdicts(info, { appId, wabaId, phoneNumberId: env.WA_PHONE_NUMBER_ID ?? null }) };
  }

  /** Registration status of the number and who has the WABA. */
  private async registrationInfo(tokenUserId: string | null, ownerBusinessId: string | null): Promise<WaRegistrationInfo> {
    const env = process.env;
    const token = env.WA_ACCESS_TOKEN;
    const phoneId = env.WA_PHONE_NUMBER_ID;
    const wabaId = env.WA_WABA_ID;
    const none = { ok: false, data: null, error: null };

    const p = phoneId ? await this.read(`/${phoneId}?fields=code_verification_status,platform_type,status,is_pin_enabled`, token) : none;
    const phone: WaRegistrationInfo["phone"] = p.ok
      ? {
          ok: true,
          error: null,
          data: {
            codeVerificationStatus: str(p.data?.code_verification_status, 40),
            platformType: str(p.data?.platform_type, 40),
            status: str(p.data?.status, 40),
            isPinEnabled: typeof p.data?.is_pin_enabled === "boolean" ? p.data.is_pin_enabled : null,
          },
        }
      : { ok: false, data: null, error: p.error };

    const u = wabaId ? await this.read(`/${wabaId}/assigned_users${ownerBusinessId ? `?business=${ownerBusinessId}` : ""}`, token) : none;
    const assignedUsers: WaRegistrationInfo["assignedUsers"] = u.ok
      ? {
          ok: true,
          error: null,
          data: ((u.data?.data ?? []) as any[]).slice(0, 50).map((x) => {
            const id = String(x?.id ?? "");
            return { id, name: str(x?.name), tasks: Array.isArray(x?.tasks) ? x.tasks.slice(0, 20).map((t: unknown) => String(t)) : [], isTokenUser: !!tokenUserId && id === tokenUserId };
          }),
        }
      : { ok: false, data: null, error: u.error };

    const info = { pinConfigured: !!registerPin(), phone, assignedUsers };
    return { ...info, verdicts: registrationVerdicts(info, tokenUserId) };
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

    const tokenInfo = await this.tokenInfo(appId);
    const registration = await this.registrationInfo(tokenInfo.debug.data?.userId ?? null, tokenInfo.wabaOwner.data?.ownerBusinessId ?? null);
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
      token: tokenInfo,
      registration,
    };
    let findings = connectionFindings(report, now);
    const tokenProblems = [...tokenInfo.verdicts, ...registration.verdicts].filter((v) => v.startsWith("❌"));
    if (tokenProblems.length) findings = [...tokenProblems, ...findings.filter((f) => !f.startsWith("✅"))];
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

  /** OWNER: register the number on this app (Cloud API) with WA_REGISTER_PIN as the two-step PIN. */
  async register(): Promise<WaRegisterResult> {
    this.owner();
    const phoneId = process.env.WA_PHONE_NUMBER_ID;
    const token = process.env.WA_ACCESS_TOKEN;
    if (!phoneId || !token) throw new BadRequestException("WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN सेट नहीं है।");
    const pin = registerPin();
    if (!pin) throw new BadRequestException("WA_REGISTER_PIN सेट नहीं है (या 6 अंक का नहीं) — Coolify में 6 अंक का two-step PIN डालकर API redeploy करें।");
    try {
      const res = await fetch(`${graphBase()}/${phoneId}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json: any = await res.json().catch(() => null);
      if (res.ok && json?.success !== false) {
        this.log.log("register number: success");
        return { ok: true, error: null, hint: "✅ नंबर इस app पर register हो गया। अब 'टेस्ट संदेश' भेजें और 'जाँचें' दोबारा दबाएँ।" };
      }
      const error = withoutPin(metaErrorOf(json, res.status), pin);
      this.log.warn(`register number: http=${res.status} code=${error.code ?? "-"} subcode=${error.subcode ?? "-"}`);
      return { ok: false, error, hint: registerHint(error) };
    } catch (e: any) {
      const msg = cleanMetaText(e?.message) ?? "network error";
      return { ok: false, error: { http: null, code: null, subcode: null, type: null, title: null, message: msg.split(pin).join("[pin]"), details: null }, hint: null };
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
