import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { SatisfactionSettings, SatisfactionSettingsInput, WaRequestDetail } from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";
import { useWaT } from "./waI18n";
import { formatDate } from "./waLabels";

/** OWNER/ADMIN: ratings, low-rating feedback; OWNER edits review link, correction policy, rating timing. */
export function SatisfactionPanel() {
  const { t, lang } = useWaT();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const h = { headers: authHeaders(token) };
  const q = useQuery({ queryKey: ["satisfaction"], enabled: !!token, retry: false, queryFn: () => api.get("whatsapp/satisfaction", h).json<SatisfactionSettings>() });
  const save = useMutation<SatisfactionSettings, Error, SatisfactionSettingsInput>({
    mutationFn: (json) => api.put("whatsapp/satisfaction", { ...h, json }).json(),
    onSuccess: (d) => qc.setQueryData(["satisfaction"], d),
  });
  const [f, setF] = useState<SatisfactionSettingsInput | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (q.data) setF({ reviewUrl: q.data.reviewUrl, correctionPolicy: q.data.correctionPolicy, ratingDelayHours: q.data.ratingDelayHours, ratingsEnabled: q.data.ratingsEnabled });
  }, [q.data]);
  if (!q.data || !f) return null;
  const s = q.data;
  async function onSave() {
    setMsg(null);
    try {
      await save.mutateAsync(f!);
      setMsg({ text: t("waSaved"), ok: true });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("csError")), ok: false });
    }
  }
  return (
    <details style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        ⭐ {t("csTitle")} · {s.stats.average != null ? t("csAvg", { avg: s.stats.average, n: s.stats.rated }) : t("csNoRatings")}
      </summary>
      <div style={{ padding: "8px 0" }}>
        <p className="doc-sub">{t("csStats", { asked: s.stats.asked, rated: s.stats.rated, low: s.stats.low, corr: s.stats.corrections })}</p>
        {s.lowRatings.map((r) => (
          <div key={r.requestId} className="doc-sub" style={{ marginTop: 2 }}>
            <Link to="/whatsapp-requests/$id" params={{ id: r.requestId }}>
              {r.ref}
            </Link>{" "}
            · {"⭐".repeat(r.rating)} · {formatDate(r.at, lang)}
            {r.feedback ? ` — “${r.feedback}”` : ""}
          </div>
        ))}
        <div style={{ display: "grid", gap: 8, marginTop: 10, maxWidth: 760 }}>
          <label className="modal-field">
            {t("csReviewUrl")}
            <input disabled={!s.canManage} placeholder="https://g.page/r/…/review" value={f.reviewUrl} onChange={(e) => setF({ ...f, reviewUrl: e.target.value })} />
          </label>
          <label className="modal-field">
            {t("csPolicy")}
            <textarea rows={3} disabled={!s.canManage} value={f.correctionPolicy} onChange={(e) => setF({ ...f, correctionPolicy: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" disabled={!s.canManage} checked={f.ratingsEnabled} onChange={(e) => setF({ ...f, ratingsEnabled: e.target.checked })} />
              {t("csAskRatings")}
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {t("csDelay")}
              <input
                type="number"
                min={1}
                max={168}
                className="dr-action-select"
                style={{ width: 80 }}
                disabled={!s.canManage}
                value={f.ratingDelayHours}
                onChange={(e) => setF({ ...f, ratingDelayHours: Math.max(1, Math.min(168, Math.round(Number(e.target.value) || 24))) })}
              />
            </label>
          </div>
          {s.canManage ? (
            <button type="button" className="btn-calc" style={{ justifySelf: "start" }} disabled={save.isPending} onClick={onSave}>
              {t("csSave")}
            </button>
          ) : (
            <p className="doc-sub">{t("csOwnerOnly")}</p>
          )}
          {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
        </div>
      </div>
    </details>
  );
}

/** On the request page: rating, feedback, corrections the customer sent. */
export function SatisfactionCard({ r }: { r: WaRequestDetail }) {
  const { t, lang } = useWaT();
  const s = r.satisfaction;
  if (!s || (!s.rating && !s.corrections.length && !s.packetSentAt)) return null;
  return (
    <div className="dr-form">
      <h3 style={{ fontSize: 16, fontWeight: 800 }}>⭐ {t("csCardTitle")}</h3>
      {s.rating != null && (
        <p style={{ fontWeight: 700 }}>
          {"⭐".repeat(s.rating)} ({s.rating}/5){s.ratingAt ? ` · ${formatDate(s.ratingAt, lang)}` : ""}
        </p>
      )}
      {s.feedback && <p className="modal-error">“{s.feedback}”</p>}
      {s.corrections.length > 0 && (
        <>
          <div style={{ fontWeight: 700 }}>{t("csCorrections")}</div>
          {s.corrections.map((c, i) => (
            <div key={i} style={{ fontSize: 14 }}>
              • {c.text} <span className="doc-sub">({formatDate(c.at, lang)})</span>
            </div>
          ))}
        </>
      )}
      {s.packetSentAt && <p className="doc-sub">📦 {t("csPacketSent", { at: formatDate(s.packetSentAt, lang) })}</p>}
    </div>
  );
}
