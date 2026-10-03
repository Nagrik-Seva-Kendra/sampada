import { useState } from "react";
import type { AiDraftRunItem } from "@sampada/shared";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { useWaT } from "../whatsapp/waI18n";
import { formatDate } from "../whatsapp/waLabels";
import { useAiAvailability, useAiGenerate, useAiMarkReviewed, useAiSettingsActions } from "./useAiDraft";

/**
 * "AI से पूरा ड्राफ्ट" on a WhatsApp request (OWNER/ADMIN or the assignee --
 * the API 404s for anyone else, and the card then stays hidden). Shows the
 * transparency of the latest run: old deeds used and why, facts with their
 * source, checks, senior review, tokens and cost.
 */
export function AiDraftCard({ requestId }: { requestId: string }) {
  const { t, lang } = useWaT();
  const q = useAiAvailability(requestId);
  const gen = useAiGenerate(requestId);
  const reviewed = useAiMarkReviewed(requestId);
  const { star } = useAiSettingsActions();
  const [fresh, setFresh] = useState<AiDraftRunItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!q.data) return null;
  const a = q.data;
  const run = fresh ?? a.runs[0] ?? null;

  async function onGenerate() {
    setError(null);
    try {
      setFresh(await gen.mutateAsync());
    } catch (err) {
      setError(await apiErrorMessage(err, t("aiFailed")));
    }
  }

  return (
    <div className="dr-form">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 16, fontWeight: 800 }}>🤖 {t("aiCardTitle")}</h3>
        {a.allowed && (
          <button type="button" className="btn-calc" disabled={gen.isPending} onClick={onGenerate}>
            {gen.isPending ? t("aiWorking") : t("aiButton")}
          </button>
        )}
      </div>
      {!a.allowed && a.reason && <p className="doc-sub">{t(`aiReason_${a.reason}` as StringKey)}</p>}
      {error && <p className="modal-error">{error}</p>}
      {run && (
        <div style={{ marginTop: 10 }}>
          {run.status === "NO_EXAMPLES" && <p className="modal-error">{t("aiNoExamples")}</p>}
          {run.status === "BLOCKED_LEAK" && <p className="modal-error">{t("aiBlocked")}</p>}
          {run.status === "OK" && run.deedId && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`status-pill ${a.deedStatus === "REVIEWED" ? "good" : "warn"}`}>
                {a.deedStatus === "REVIEWED" ? t("aiStatusReviewed") : t("aiStatusPending")}
              </span>
              <a href={`/deeds/${run.deedType}/edit/${run.deedId}`} target="_blank" rel="noreferrer" className="doc-btn">
                {t("aiOpenDeed")}
              </a>
              {a.deedStatus !== "REVIEWED" && (
                <button type="button" className="doc-btn" disabled={reviewed.isPending} onClick={() => reviewed.mutate(run.deedId!)}>
                  ✓ {t("aiMarkReviewed")}
                </button>
              )}
              <span className="doc-sub" style={{ marginTop: 0 }}>
                {formatDate(run.createdAt, lang)}
              </span>
            </div>
          )}
          {run.examples.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginTop: 10 }}>{t("aiExamples")}</div>
              {run.examples.map((e) => (
                <div key={e.deedId} className="doc-sub" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                  <span>
                    {e.title} — {e.reason}
                  </span>
                  {a.canStar && !e.reason.includes("★") && (
                    <button type="button" className="doc-btn" style={{ padding: "2px 8px" }} disabled={star.isPending} onClick={() => star.mutate({ deedId: e.deedId, starred: true })}>
                      ★ {t("aiStar")}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
          {run.facts.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginTop: 10 }}>{t("aiFacts")}</div>
              <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
                <tbody>
                  {run.facts.map((f) => (
                    <tr key={f.label}>
                      <td style={{ padding: "2px 8px 2px 0" }}>{f.label}</td>
                      <td style={{ padding: "2px 8px", fontWeight: 600 }}>{f.value}</td>
                      <td style={{ padding: "2px 8px" }} className="doc-sub">
                        {f.source}
                      </td>
                      <td style={{ padding: "2px 8px", color: f.found ? "#16a34a" : "#dc2626" }}>{f.found ? `✓ ${t("aiFound")}` : `✗ ${t("aiMissing")}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {run.status === "OK" && (
            <>
              <div style={{ fontWeight: 700, marginTop: 10 }}>{t("aiIssues")}</div>
              {run.issues.length ? (
                run.issues.map((i, n) => (
                  <div key={n} className="modal-error" style={{ margin: "2px 0" }}>
                    • {i.message}
                  </div>
                ))
              ) : (
                <p className="doc-sub">{t("aiNoIssues")}</p>
              )}
              {run.reviewIssues.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, marginTop: 10 }}>{t("aiReview")}</div>
                  {run.reviewIssues.map((r, n) => (
                    <div key={n} style={{ fontSize: 14 }}>
                      • {r}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {run.flags.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginTop: 10 }}>{t("aiFlags")}</div>
              {run.flags.map((f, n) => (
                <div key={n} className="doc-sub" style={{ marginTop: 0 }}>
                  • {f}
                </div>
              ))}
            </>
          )}
          {run.inputTokens > 0 && (
            <p className="doc-sub">{t("aiCost", { model: run.model, inT: run.inputTokens.toLocaleString("en-IN"), outT: run.outputTokens.toLocaleString("en-IN"), cost: run.costUsd.toFixed(3) })}</p>
          )}
        </div>
      )}
    </div>
  );
}
