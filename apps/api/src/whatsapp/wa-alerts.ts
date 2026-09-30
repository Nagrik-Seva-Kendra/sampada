/**
 * Owner alert for a newly submitted WhatsApp request (pure helpers; sent via
 * WaOutboxService with the same 24h-window / template rule as customer messages).
 */
import { WA_TEMPLATES } from "@sampada/shared";
import type { TemplateCall } from "./wa-outbox.service.js";
import { validMobile } from "./intake-rules.js";
import { maskPhone } from "./webhook-diagnostics.js";

const DEED_LABEL: Record<string, string> = { sale: "विक्रय पत्र", mortgage: "बंधक पत्र", other: "अन्य दस्तावेज़" };

/** WA_ALERT_NUMBERS="9198…,98…" → WhatsApp numbers with country code (10-digit Indian numbers get 91), de-duplicated. */
export function alertNumbers(env: string | undefined = process.env.WA_ALERT_NUMBERS): string[] {
  const out = new Set<string>();
  for (const part of (env ?? "").split(/[,;\n]+/)) {
    const digits = part.replace(/\D/g, "");
    if (!digits) continue;
    const ten = validMobile(digits);
    if (ten) out.add(`91${ten}`);
    else if (digits.length >= 11 && digits.length <= 15) out.add(digits);
  }
  return [...out];
}

/** Link to the request in the office app (WA_APP_URL, default app.nsk.mpe-registry.com). */
export function requestLink(id: string, base = process.env.WA_APP_URL || "https://app.nsk.mpe-registry.com"): string {
  return `${base.replace(/\/+$/, "")}/whatsapp-requests/${id}`;
}

export interface AlertInput {
  id: string;
  ref: string;
  phone: string;
  customerName: string | null;
  data: any;
  needsStaff: boolean;
}

/** The customer name to show: the party the bot collected, else the WhatsApp profile name. */
function customerOf(a: AlertInput): string {
  const d = a.data ?? {};
  return (d.deedType === "mortgage" ? d.mortgagorName : d.buyerName) || a.customerName || "—";
}

export function alertMessage(a: AlertInput): { text: string; template: TemplateCall } {
  const deed = DEED_LABEL[a.data?.deedType] ?? DEED_LABEL.sale!;
  const deedText = a.data?.deedType === "other" && a.data?.requestedDeed ? `${deed} (${String(a.data.requestedDeed).slice(0, 60)})` : deed;
  const who = customerOf(a);
  const mobile = maskPhone(a.phone);
  const link = requestLink(a.id);
  const lines = [
    "🔔 नया WhatsApp अनुरोध",
    `अनुरोध नंबर: ${a.ref}`,
    `दस्तावेज़: ${deedText}`,
    `ग्राहक: ${who} (${mobile})`,
    ...(a.needsStaff ? ["⚠️ स्टाफ जाँच ज़रूरी"] : []),
    `देखें: ${link}`,
  ];
  return {
    text: lines.join("\n"),
    template: {
      name: WA_TEMPLATES.alert.name,
      language: WA_TEMPLATES.alert.language,
      params: [a.ref, deedText, who, mobile, a.needsStaff ? "हाँ" : "नहीं", link],
    },
  };
}
