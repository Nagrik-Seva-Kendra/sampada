import { useState } from "react";
import type { AiPropertyTypeT } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { useWaT } from "../whatsapp/waI18n";
import { formatDate } from "../whatsapp/waLabels";
import { useAiEvals, useAiSettings, useAiSettingsActions } from "./useAiDraft";

const TYPES: AiPropertyTypeT[] = ["plot", "building", "agricultural", "flat"];

/** OWNER/ADMIN view; OWNER changes: per-type on/off (only after a passing eval), evals, ideal deeds. */
export function AiSettingsPage() {
  const { t, lang } = useWaT();
  const s = useAiSettings();
  const evals = useAiEvals();
  const a = useAiSettingsActions();
  const [error, setError] = useState<string | null>(null);
  const [starInput, setStarInput] = useState("");
  const run = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
    } catch (err) {
      setError(await apiErrorMessage(err, t("aiError")));
    }
  };
  if (s.isLoading) return <Skeleton className="h-5 w-full" />;
  if (!s.data) return <p className="modal-error">{t("aiOwnerOnly")}</p>;
  const d = s.data;
  const owner = d.canManage;
  const pct = (x: number) => Math.round(x * 100);
  const evalRunning = (evals.data ?? []).some((e) => e.status === "RUNNING");

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("aiSettingsKicker")}
        </div>
        <div className="page-head">
          <h2 className="page-title">🤖 {t("aiSettingsTitle")}</h2>
        </div>
        <p className="doc-sub" style={{ maxWidth: 760 }}>
          {t("aiSettingsIntro")}
        </p>
        <p className="doc-sub">
          {d.model} · {t("aiNeed", { th: pct(d.threshold) })}
          {!owner ? ` · ${t("aiOwnerOnly")}` : ""}
        </p>
        {error && <p className="modal-error">{error}</p>}

        <div className="dr-form" style={{ marginBottom: 14 }}>
          {TYPES.map((pt) => {
            const ev = d.lastEval[pt];
            const passed = !!ev && ev.score >= d.threshold;
            return (
              <div key={pt} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border, #e5e5e5)" }}>
                <b style={{ minWidth: 150 }}>{t(`aiPt_${pt}` as StringKey)}</b>
                <span className={`status-pill ${d.enabled[pt] ? "good" : "neutral"}`}>{d.enabled[pt] ? t("aiOn") : t("aiOff")}</span>
                <span className="doc-sub" style={{ marginTop: 0, flex: "1 1 220px" }}>
                  {ev ? t("aiLastEval", { score: pct(ev.score), total: ev.total, at: formatDate(ev.finishedAt, lang) }) : t("aiNoEval")}
                </span>
                {owner && (
                  <>
                    <button type="button" className="doc-btn" disabled={evalRunning || a.startEval.isPending} onClick={() => run(a.startEval.mutateAsync({ propertyType: pt }))}>
                      {t("aiRunEval")}
                    </button>
                    <button
                      type="button"
                      className={d.enabled[pt] || !passed ? "doc-btn" : "btn-calc"}
                      disabled={a.toggle.isPending || (!d.enabled[pt] && !passed)}
                      title={!passed ? t("aiNeed", { th: pct(d.threshold) }) : undefined}
                      onClick={() => run(a.toggle.mutateAsync({ propertyType: pt, enabled: !d.enabled[pt] }))}
                    >
                      {d.enabled[pt] ? t("aiTurnOff") : t("aiTurnOn")}
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {owner && <p className="doc-sub">{t("aiEvalCostNote")}</p>}
        </div>

        <div className="dr-form" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("aiEvals")}</div>
          {(evals.data ?? []).length === 0 && <p className="doc-sub">{t("aiNoEval")}</p>}
          {(evals.data ?? []).map((e) => (
            <details key={e.id} style={{ padding: "6px 0", borderTop: "1px solid var(--border, #e5e5e5)" }}>
              <summary style={{ cursor: "pointer" }}>
                <b>{t(`aiPt_${e.propertyType}` as StringKey)}</b> · {formatDate(e.startedAt, lang)} ·{" "}
                {e.status === "RUNNING"
                  ? t("aiEvalRunning", { done: e.done, total: e.total })
                  : e.status === "FAILED"
                    ? t("aiEvalFailed")
                    : t("aiEvalDone", { passed: e.passed, total: e.total, score: pct(e.score ?? 0), cost: e.costUsd.toFixed(2) })}
              </summary>
              <div className="doc-sub">{t("aiEvalFailures")}:</div>
              {e.details
                .filter((x) => !x.pass)
                .map((x) => (
                  <div key={x.deedId} className="doc-sub" style={{ marginTop: 0 }}>
                    {x.deedId.slice(0, 8)}… — {x.problems.join("; ")}
                  </div>
                ))}
            </details>
          ))}
        </div>

        <div className="dr-form">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>★ {t("aiStarred")}</div>
          {d.starred.map((x) => (
            <div key={x.deedId} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
              <span style={{ flex: 1 }}>
                {x.title} {x.propertyType ? `(${t(`aiPt_${x.propertyType}` as StringKey)})` : ""}
              </span>
              {owner && (
                <button type="button" className="doc-btn" onClick={() => run(a.star.mutateAsync({ deedId: x.deedId, starred: false }))}>
                  {t("aiRemove")}
                </button>
              )}
            </div>
          ))}
          {owner && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input className="dr-action-select" style={{ flex: "1 1 280px" }} placeholder={t("aiStarHint")} value={starInput} onChange={(e) => setStarInput(e.target.value)} />
              <button
                type="button"
                className="btn-calc"
                disabled={!starInput.trim() || a.star.isPending}
                onClick={() => {
                  const id = starInput.trim().split("/").filter(Boolean).pop() ?? "";
                  run(a.star.mutateAsync({ deedId: id, starred: true }).then(() => setStarInput("")));
                }}
              >
                {t("aiAdd")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
