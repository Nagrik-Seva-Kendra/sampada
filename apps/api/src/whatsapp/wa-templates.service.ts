import { ConflictException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { templateProblems, WA_TEMPLATES, type WaTemplateDef, type WaTemplateStatus, type WaTemplateSubmitResult } from "@sampada/shared";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { isManagerRole } from "./wa-requests.service.js";
import { cleanMetaText, graphBase } from "./webhook-diagnostics.js";

/** Graph body for submitting one template for Meta's review. */
export function templateSubmission(t: WaTemplateDef) {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    components: [{ type: "BODY", text: t.body, example: { body_text: [t.example] } }],
  };
}

export { cleanMetaText };

/** The useful part of a Graph error: code, error_subcode, error_user_title, error_user_msg (or message). */
export function metaError(json: any, httpStatus: number) {
  const e = json?.error ?? {};
  return {
    errorCode: (e.code as number | undefined) ?? httpStatus,
    errorSubcode: (e.error_subcode as number | undefined) ?? undefined,
    errorTitle: cleanMetaText(e.error_user_title, 120),
    errorMessage: cleanMetaText(e.error_user_msg) ?? cleanMetaText(e.message),
  };
}

/**
 * The WhatsApp templates in WA_TEMPLATES: their approval state at Meta and a
 * one-click submission (POST /{WA_WABA_ID}/message_templates). OWNER/ADMIN only.
 */
@Injectable()
export class WaTemplatesService {
  private readonly log = new Logger("WhatsappTemplates");
  /** Organizations with a submission running (a double click must not send everything twice). */
  private readonly running = new Set<string>();

  constructor(private readonly cls: ClsService) {}

  private guard() {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    const waba = process.env.WA_WABA_ID;
    const token = process.env.WA_ACCESS_TOKEN;
    if (!waba || !token) throw new ServiceUnavailableException("WA_WABA_ID / WA_ACCESS_TOKEN सेट नहीं हैं।");
    return { tenant, waba, token };
  }

  async status(): Promise<WaTemplateStatus[]> {
    const { waba, token } = this.guard();
    const res = await fetch(`${graphBase()}/${waba}/message_templates?fields=name,status,language&limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) throw new ServiceUnavailableException(`Meta से टेम्पलेट सूची नहीं मिली (कोड ${json?.error?.code ?? res.status})।`);
    const found: { name: string; status: string; language: string }[] = json?.data ?? [];
    return Object.entries(WA_TEMPLATES as Record<string, WaTemplateDef>).map(([key, t]) => ({
      key,
      name: t.name,
      status: found.find((f) => f.name === t.name && f.language === t.language)?.status ?? null,
    }));
  }

  /** Submits every configured template that Meta does not have yet. One submission per office at a time. */
  async submit(): Promise<WaTemplateSubmitResult[]> {
    const { tenant, waba, token } = this.guard();
    if (this.running.has(tenant.organizationId)) throw new ConflictException("टेम्पलेट पहले से भेजे जा रहे हैं, कृपया कुछ क्षण रुकें।");
    this.running.add(tenant.organizationId);
    try {
      return await this.submitAll(tenant.userId, waba, token);
    } finally {
      this.running.delete(tenant.organizationId);
    }
  }

  private async submitAll(userId: string, waba: string, token: string): Promise<WaTemplateSubmitResult[]> {
    const current = await this.status();
    const out: WaTemplateSubmitResult[] = [];
    for (const [key, t] of Object.entries(WA_TEMPLATES as Record<string, WaTemplateDef>)) {
      if (current.find((c) => c.key === key)?.status) {
        out.push({ key, name: t.name, code: "exists", result: "पहले से भेजा हुआ" });
        continue;
      }
      const problems = templateProblems(t);
      if (problems.length) {
        out.push({ key, name: t.name, code: "invalid", problems, result: `नियम पूरे नहीं (${problems.join(", ")}), Meta को नहीं भेजा` });
        this.log.warn(`template ${t.name} not submitted: ${problems.join(", ")}`);
        continue;
      }
      const res = await fetch(`${graphBase()}/${waba}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(templateSubmission(t)),
      });
      const json: any = await res.json().catch(() => null);
      if (res.ok) {
        const status = json?.status ?? "PENDING";
        out.push({ key, name: t.name, code: "submitted", status, result: `भेजा गया (${status})` });
        continue;
      }
      const err = metaError(json, res.status);
      const detail = [err.errorTitle, err.errorMessage].filter(Boolean).join(": ");
      out.push({
        key,
        name: t.name,
        code: "error",
        ...err,
        result: `त्रुटि (कोड ${err.errorCode}${err.errorSubcode ? `/${err.errorSubcode}` : ""})${detail ? ` — ${detail}` : ""}`,
      });
      this.log.warn(
        `template ${t.name} refused by Meta: code=${err.errorCode} subcode=${err.errorSubcode ?? "-"} title="${err.errorTitle ?? "-"}" msg="${err.errorMessage ?? "-"}"`,
      );
    }
    this.log.log(`templates submitted by user ${userId}: ${out.map((o) => `${o.name}=${o.code}`).join(", ")}`);
    return out;
  }
}
