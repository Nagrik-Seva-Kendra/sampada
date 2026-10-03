import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArchiveCopyDeed, ArchiveCopyItem, ArchiveCopySettings } from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";
import { deedPdfBase64 } from "../deeds/deedPdf";
import { useWaT } from "./waI18n";
import { formatDate } from "./waLabels";

/**
 * OWNER/ADMIN: customers' requests for a copy of their registry (verified on
 * WhatsApp). "भेजें" renders the deed as a watermarked PDF in this browser
 * (Aadhaar/PAN already cut to the last 4 by the server) and sends it.
 * Switching the feature on/off and the daily limit: OWNER only.
 */
export function ArchiveCopyPanel() {
  const { t, lang } = useWaT();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const h = { headers: authHeaders(token) };
  const settings = useQuery({ queryKey: ["archive-copy", "settings"], enabled: !!token, retry: false, queryFn: () => api.get("whatsapp/archive-copy/settings", h).json<ArchiveCopySettings>() });
  const list = useQuery({ queryKey: ["archive-copy", "list"], enabled: !!token, retry: false, queryFn: () => api.get("whatsapp/archive-copy", h).json<ArchiveCopyItem[]>() });
  const save = useMutation<ArchiveCopySettings, Error, { enabled: boolean; dailyLimit: number }>({
    mutationFn: (json) => api.put("whatsapp/archive-copy/settings", { ...h, json }).json(),
    onSuccess: (d) => qc.setQueryData(["archive-copy", "settings"], d),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!settings.data) return null;
  const s = settings.data;
  const pending = (list.data ?? []).filter((x) => x.status === "REQUESTED").length;

  async function send(item: ArchiveCopyItem) {
    setBusy(item.id);
    setMsg(null);
    try {
      const d = await api.get(`whatsapp/archive-copy/${item.id}/deed`, h).json<ArchiveCopyDeed>();
      const pdfBase64 = await deedPdfBase64(d.title, d.content, d.watermark);
      const r = await api.post(`whatsapp/archive-copy/${item.id}/send`, { ...h, json: { pdfBase64 }, timeout: false }).json<ArchiveCopyItem>();
      setMsg(r.status === "SENT" ? t("acSent", { n: r.number }) : t("acNotSent", { reason: r.reason ?? "" }));
    } catch (err) {
      setMsg(await apiErrorMessage(err, t("acError")));
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["archive-copy", "list"] });
    }
  }
  async function reject(item: ArchiveCopyItem) {
    if (!window.confirm(t("acRejectConfirm", { n: item.number }))) return;
    await api.post(`whatsapp/archive-copy/${item.id}/reject`, h).json().catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["archive-copy", "list"] });
  }

  return (
    <details style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        📄 {t("acTitle")} {pending > 0 ? `(${pending})` : ""} · {s.enabled ? t("acOn") : t("acOff")}
      </summary>
      <div style={{ padding: "8px 0" }}>
        <p className="doc-sub">{t("acIntro")}</p>
        {s.canManage ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={s.enabled} disabled={save.isPending} onChange={(e) => save.mutate({ enabled: e.target.checked, dailyLimit: s.dailyLimit })} />
              {t("acEnable")}
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {t("acLimit")}
              <input
                type="number"
                min={1}
                max={10}
                className="dr-action-select"
                style={{ width: 70 }}
                value={s.dailyLimit}
                onChange={(e) => save.mutate({ enabled: s.enabled, dailyLimit: Math.max(1, Math.min(10, Number(e.target.value) || 3)) })}
              />
            </label>
          </div>
        ) : (
          <p className="doc-sub">{t("acOwnerOnly")}</p>
        )}
        {msg && <p className="doc-sub" style={{ fontWeight: 700 }}>{msg}</p>}
        {(list.data ?? []).map((x) => (
          <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--border, #e5e5e5)" }}>
            <b>#{x.number}</b>
            <span>{x.deedTitle}</span>
            <span className="doc-sub" style={{ marginTop: 0 }}>
              {x.phoneMasked} · {formatDate(x.createdAt, lang)}
            </span>
            <span className={`status-pill ${x.status === "SENT" ? "good" : x.status === "REJECTED" ? "bad" : "warn"}`}>{t(`acSt_${x.status}`)}</span>
            {x.reason && x.status === "REQUESTED" && <span className="modal-error" style={{ margin: 0 }}>{x.reason}</span>}
            {x.status === "REQUESTED" && (
              <>
                <button type="button" className="btn-calc" disabled={busy !== null} onClick={() => send(x)}>
                  {busy === x.id ? t("acSending") : t("acSend")}
                </button>
                <button type="button" className="doc-btn" disabled={busy !== null} onClick={() => reject(x)}>
                  {t("acReject")}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
