import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArchiveRiskResult } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";
import { useWaT } from "./waI18n";
import { formatDate } from "./waLabels";

/** Warnings from the office's own older deeds of this property (double sale, chain, mortgage). */
export function ArchiveRiskCard({ requestId, canManage }: { requestId: string; canManage: boolean }) {
  const { t, lang } = useWaT();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const h = { headers: authHeaders(token) };
  const q = useQuery({
    queryKey: ["archive-risk", requestId],
    enabled: !!token,
    retry: false,
    queryFn: () => api.get(`archive-risk/requests/${requestId}`, h).json<ArchiveRiskResult>(),
  });
  const run = useMutation({
    mutationFn: () => api.post("archive-risk/index", { ...h, timeout: false }).json<{ read: number }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive-risk", requestId] }),
  });
  if (!q.data) return null;
  const r = q.data;
  return (
    <div className="dr-form">
      <h3 style={{ fontSize: 16, fontWeight: 800 }}>🛡️ {t("arTitle")}</h3>
      {!r.checked ? (
        <p className="doc-sub">{t("arNotChecked")}</p>
      ) : r.warnings.length ? (
        r.warnings.map((w, i) => (
          <div key={i} className="modal-error" style={{ margin: "6px 0" }}>
            ⚠️ <b>{t(`ar_${w.code}`)}</b>: {w.message}
            <div className="doc-sub" style={{ marginTop: 2 }}>
              <a href={`/deeds/${w.deedType}/edit/${w.deedId}`} target="_blank" rel="noreferrer">
                {w.deedTitle}
              </a>{" "}
              · {w.date}
            </div>
          </div>
        ))
      ) : (
        <p className="doc-sub">✅ {t("arNone", { n: r.sameProperty })}</p>
      )}
      <p className="doc-sub">
        {t("arIndex", { indexed: r.index.indexed, total: r.index.total })}
        {r.index.lastRunAt ? ` · ${formatDate(r.index.lastRunAt, lang)}` : ""}
        {canManage && (
          <button type="button" className="doc-btn" style={{ marginLeft: 8, padding: "2px 10px" }} disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? t("arRunning") : t("arRun")}
          </button>
        )}
      </p>
    </div>
  );
}
