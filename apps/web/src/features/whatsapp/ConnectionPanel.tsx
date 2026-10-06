import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { WaConnectionReport, WaGraphRead, WaMetaError, WaTestMessageResult } from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useActiveOrganization, useAuthStore } from "../../stores/authStore";
import { useWaT, type WaT } from "./waI18n";

/** Meta's error in one line: code / subcode, title, message, details. */
function errText(e: WaMetaError | null): string {
  if (!e) return "";
  const code = [e.code ?? e.http, e.subcode].filter((x) => x != null).join(" / ");
  return [code && `(${code})`, e.title, e.message, e.details].filter(Boolean).join(" — ");
}

function Section({ title, read, t }: { title: string; read: WaGraphRead<any>; t: WaT }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {read.ok ? (
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0", maxHeight: 260, overflow: "auto" }}>{JSON.stringify(read.data, null, 2)}</pre>
      ) : (
        <p className="modal-error" style={{ margin: "4px 0" }}>
          {read.error ? errText(read.error) : t("wcNotRead")}
        </p>
      )}
    </div>
  );
}

const when = (iso: string | null, lang: string) => (iso ? new Date(iso).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { timeZone: "Asia/Kolkata" }) : "—");

/**
 * OWNER: "WhatsApp connection check" -- what Meta says about the number, the
 * WABA, the subscribed apps and this app's webhook, what this server has seen,
 * a test message to the owner's own number and re-subscribing the app.
 */
export function ConnectionPanel() {
  const { t, lang } = useWaT();
  const token = useAuthStore((s) => s.token);
  const org = useActiveOrganization();
  const h = { headers: authHeaders(token) };
  const check = useMutation<WaConnectionReport, Error, void>({ mutationFn: () => api.get("whatsapp/connection", h).json<WaConnectionReport>() });
  const test = useMutation<WaTestMessageResult, Error, void>({ mutationFn: () => api.post("whatsapp/connection/test", h).json<WaTestMessageResult>() });
  const resub = useMutation<WaGraphRead, Error, boolean>({ mutationFn: (override) => api.post("whatsapp/connection/resubscribe", { ...h, json: { override } }).json<WaGraphRead>() });
  const [error, setError] = useState<string | null>(null);
  if (org?.role !== "OWNER") return null;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(await apiErrorMessage(err, t("wcError")));
    }
  };
  const r = check.data;
  return (
    <details style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>🩺 {t("wcTitle")}</summary>
      <div style={{ padding: "8px 0" }}>
        <p className="doc-sub">{t("wcHint")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-calc" disabled={check.isPending} onClick={() => run(() => check.mutateAsync())}>
            {check.isPending ? "…" : t("wcCheck")}
          </button>
          <button type="button" className="doc-btn" disabled={test.isPending} onClick={() => run(() => test.mutateAsync())}>
            {test.isPending ? "…" : t("wcTest")}
          </button>
          <button type="button" className="doc-btn" disabled={resub.isPending} onClick={() => run(() => resub.mutateAsync(false).then(() => check.mutateAsync()))}>
            {t("wcResub")}
          </button>
          <button
            type="button"
            className="doc-btn"
            disabled={resub.isPending}
            onClick={() => window.confirm(t("wcResubOverrideConfirm")) && run(() => resub.mutateAsync(true).then(() => check.mutateAsync()))}
          >
            {t("wcResubOverride")}
          </button>
        </div>
        {error && <p className="modal-error">{error}</p>}
        {test.data && (
          <p className={test.data.ok ? "doc-sub" : "modal-error"} role="status" style={{ marginTop: 8 }}>
            {test.data.ok ? `✅ ${t("wcTestOk", { to: test.data.to ?? "" })}` : `❌ ${t("wcTestFail", { to: test.data.to ?? "" })} ${errText(test.data.error)}`}
            {test.data.hint && <span style={{ display: "block" }}>{test.data.hint}</span>}
          </p>
        )}
        {resub.data && (
          <p className={resub.data.ok ? "doc-sub" : "modal-error"} style={{ marginTop: 8 }}>
            {resub.data.ok ? `✅ ${t("wcResubOk")}` : `❌ ${errText(resub.data.error)}`}
          </p>
        )}
        {r && (
          <div style={{ marginTop: 10 }}>
            <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
              {r.findings.map((f, i) => (
                <li key={i} className={f.startsWith("❌") ? "modal-error" : "doc-sub"} style={{ marginBottom: 4 }}>
                  {f}
                </li>
              ))}
            </ul>
            <div style={{ fontWeight: 700, marginTop: 10 }}>{t("wcServer")}</div>
            <p className="doc-sub" style={{ margin: "4px 0" }}>
              {t("wcWebhooks", { n: r.webhook.posts, bad: r.webhook.invalidSignature, since: when(r.webhook.startedAt, lang) })}
              <br />
              {t("wcLastWebhook", { at: when(r.webhook.lastPostAt, lang), sig: r.webhook.lastSignatureOk == null ? "—" : r.webhook.lastSignatureOk ? "✅" : `❌ ${r.webhook.lastInvalidReason ?? ""}` })}
              <br />
              {t("wcLastMessage", { at: when(r.webhook.lastMessageAt ?? r.webhook.lastStoredMessageAt, lang) })}
              <br />
              {t("wcLastOutbound", {
                v: r.lastOutbound ? `${when(r.lastOutbound.at, lang)} · ${r.lastOutbound.kind} · ${r.lastOutbound.ok ? "✅" : `❌ ${errText(r.lastOutbound.error)}`}` : "—",
              })}
            </p>
            <div style={{ fontWeight: 700, marginTop: 10 }}>{t("wcConfig")}</div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0" }}>{JSON.stringify(r.config, null, 2)}</pre>
            <Section title={t("wcApps")} read={r.subscribedApps} t={t} />
            <Section title={t("wcPhone")} read={r.phone} t={t} />
            <Section title={t("wcWaba")} read={r.waba} t={t} />
            <Section title={t("wcAppSubs")} read={r.appSubscriptions} t={t} />
          </div>
        )}
      </div>
    </details>
  );
}
