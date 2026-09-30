import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { WA_TEMPLATES, type WaTemplateDef, type WaTemplateStatus, type WaTemplateSubmitResult } from "@sampada/shared";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { isManagerRole } from "./wa-requests.service.js";
import { graphBase } from "./webhook-diagnostics.js";

/** Graph body for submitting one template for Meta's review. */
export function templateSubmission(t: WaTemplateDef) {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    components: [{ type: "BODY", text: t.body, example: { body_text: [t.example] } }],
  };
}

/**
 * The WhatsApp templates in WA_TEMPLATES: their approval state at Meta and a
 * one-click submission (POST /{WA_WABA_ID}/message_templates). OWNER/ADMIN only.
 */
@Injectable()
export class WaTemplatesService {
  private readonly log = new Logger("WhatsappTemplates");

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

  /** Submits every configured template that Meta does not have yet. */
  async submit(): Promise<WaTemplateSubmitResult[]> {
    const { tenant, waba, token } = this.guard();
    const current = await this.status();
    const out: WaTemplateSubmitResult[] = [];
    for (const [key, t] of Object.entries(WA_TEMPLATES as Record<string, WaTemplateDef>)) {
      if (current.find((c) => c.key === key)?.status) {
        out.push({ key, name: t.name, code: "exists", result: "पहले से भेजा हुआ" });
        continue;
      }
      const res = await fetch(`${graphBase()}/${waba}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(templateSubmission(t)),
      });
      const json: any = await res.json().catch(() => null);
      const status = json?.status ?? "PENDING";
      const errorCode = json?.error?.code ?? res.status;
      out.push(
        res.ok
          ? { key, name: t.name, code: "submitted", status, result: `भेजा गया (${status})` }
          : { key, name: t.name, code: "error", errorCode, result: `त्रुटि (कोड ${errorCode})` },
      );
    }
    this.log.log(`templates submitted by user ${tenant.userId}: ${out.map((o) => `${o.name}=${o.result}`).join(", ")}`);
    return out;
  }
}
