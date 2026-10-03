import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CallbackItem, FollowUpRule } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { useWaAssignees } from "../whatsapp/useWhatsappRequests";
import { useWaT } from "../whatsapp/waI18n";
import { formatDate, formatDay } from "../whatsapp/waLabels";
import { useCallbackActions, useCallbacks, useFollowUps, useSaveFollowUpRules } from "./useCalls";
import "../whatsapp/waRequests.css";

type Tab = "callbacks" | "followups";

/** Customers who asked for a call (WhatsApp menu 5 / follow-up replies), and the follow-up reminders. */
export function CallsPage() {
  const { t } = useWaT();
  const [tab, setTab] = useState<Tab>("callbacks");
  const calls = useCallbacks();
  const newCount = calls.data?.newCount ?? 0;
  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("clKicker")}
        </div>
        <div className="page-head">
          <h2 className="page-title">{t("clTitle")}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button type="button" className={tab === "callbacks" ? "btn-calc" : "doc-btn"} onClick={() => setTab("callbacks")}>
            {t("clTabCallbacks")} {newCount > 0 ? `(${newCount})` : ""}
          </button>
          <button type="button" className={tab === "followups" ? "btn-calc" : "doc-btn"} onClick={() => setTab("followups")}>
            {t("clTabFollowUps")}
          </button>
        </div>
        {tab === "callbacks" ? <CallbacksTab /> : <FollowUpsTab />}
      </div>
    </section>
  );
}

function CallbacksTab() {
  const { t, lang } = useWaT();
  const q = useCallbacks();
  const canManage = q.data?.canManage ?? false;
  const staff = useWaAssignees(canManage);
  const a = useCallbackActions();
  const [closing, setClosing] = useState<CallbackItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (q.isLoading) return <Skeleton className="h-5 w-full" />;
  if (q.isError) return <p className="modal-error">{t("clLoadError")}</p>;
  const rows = q.data?.data ?? [];
  if (!rows.length) return <p className="doc-sub">{t("clEmpty")}</p>;
  return (
    <div>
      {error && <p className="modal-error">{error}</p>}
      {rows.map((c) => (
        <div key={c.id} className="dr-form" style={{ marginBottom: 10, opacity: c.status === "DONE" ? 0.75 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>
                #{c.number} · {c.customerName || "—"} ·{" "}
                <span className={`status-pill ${c.status === "NEW" ? "warn" : "good"}`}>{t(`clStatus${c.status}` as StringKey)}</span>
              </div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>🕐 {c.preferredAt ? formatDate(c.preferredAt, lang) : t("clAsap")}</div>
              <div className="doc-sub" style={{ marginTop: 2 }}>
                {[
                  c.preferredText ? t("clCustomerSaid", { t: c.preferredText }) : null,
                  c.source === "followup" ? t("clFromFollowUp") : null,
                  formatDate(c.createdAt, lang),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{c.purpose}</div>
              {c.requestId && (
                <Link to="/whatsapp-requests/$id" params={{ id: c.requestId }} className="doc-sub">
                  {t("clRequest", { ref: c.requestRef ?? "" })}
                </Link>
              )}
              {c.status === "DONE" && (
                <div className="doc-sub" style={{ marginTop: 4 }}>
                  ✅ {t("clDoneBy", { name: c.doneByName ?? "—", at: c.doneAt ? formatDate(c.doneAt, lang) : "" })}
                  {c.doneNote ? ` — ${c.doneNote}` : ""}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              <a className="btn-calc" href={`tel:+${c.phone}`}>
                📞 {t("clCall")}
              </a>
              {c.status === "NEW" ? (
                <button type="button" className="doc-btn" onClick={() => setClosing(c)}>
                  {t("clDone")}
                </button>
              ) : (
                <button type="button" className="doc-btn" disabled={a.reopen.isPending} onClick={() => a.reopen.mutate(c.id)}>
                  {t("clReopen")}
                </button>
              )}
              {canManage && (
                <select
                  className="dr-action-select"
                  aria-label={t("clAssignee")}
                  value={c.assigneeId ?? ""}
                  onChange={(e) =>
                    a.assign.mutate(
                      { id: c.id, assigneeId: e.target.value || null },
                      { onError: async (err) => setError(await apiErrorMessage(err, t("clSaveError"))) },
                    )
                  }
                >
                  <option value="">{t("clNobody")}</option>
                  {(staff.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {!canManage && c.assigneeName && <span className="doc-sub">{c.assigneeName}</span>}
            </div>
          </div>
        </div>
      ))}
      {closing && <DoneDialog item={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

function DoneDialog({ item, onClose }: { item: CallbackItem; onClose: () => void }) {
  const { t } = useWaT();
  const { done } = useCallbackActions();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await done.mutateAsync({ id: item.id, note: note.trim() || null });
      onClose();
    } catch (err) {
      setError(await apiErrorMessage(err, t("clSaveError")));
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            #{item.number} · {t("clDone")}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label={t("clCancel")}>
            ✕
          </button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <label className="modal-field">
            {t("clNote")}
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="btn-calc modal-submit" disabled={done.isPending}>
            {t("clSave")}
          </button>
        </form>
      </div>
    </div>
  );
}

function FollowUpsTab() {
  const { t, lang } = useWaT();
  const q = useFollowUps();
  const save = useSaveFollowUpRules();
  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (q.data) setRules(q.data.rules);
  }, [q.data]);
  if (q.isLoading) return <Skeleton className="h-5 w-full" />;
  if (q.isError || !q.data) return <p className="modal-error">{t("clLoadError")}</p>;
  const set = (i: number, patch: Partial<FollowUpRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  async function onSave() {
    setMsg(null);
    try {
      await save.mutateAsync(rules);
      setMsg({ text: t("fuSaved"), ok: true });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("clSaveError")), ok: false });
    }
  }
  return (
    <div>
      {q.data.canManage && (
        <div className="dr-form" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800 }}>{t("fuRules")}</div>
          <p className="doc-sub">{t("fuRulesHint")}</p>
          {rules.map((r, i) => (
            <div key={r.kind} style={{ borderTop: "1px solid var(--border, #e5e5e5)", padding: "10px 0" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ flex: "1 1 260px" }}>{t(`fuKind_${r.kind}` as StringKey)}</b>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} />
                  {t("fuEnabled")}
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {t("fuDays")}
                  <input
                    type="number"
                    min={0}
                    max={365}
                    className="dr-action-select"
                    style={{ width: 80 }}
                    value={r.offsetDays}
                    onChange={(e) => set(i, { offsetDays: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })}
                  />
                </label>
              </div>
              <label className="modal-field" style={{ marginTop: 6 }}>
                {t("fuText")}
                <textarea rows={3} maxLength={600} value={r.text} onChange={(e) => set(i, { text: e.target.value })} />
              </label>
            </div>
          ))}
          <button type="button" className="btn-calc" disabled={save.isPending} onClick={onSave}>
            {t("fuSaveRules")}
          </button>
          {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
        </div>
      )}
      <div className="dr-form">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("fuList")}</div>
        {!q.data.data.length && <p className="doc-sub">{t("fuNone")}</p>}
        {q.data.data.map((f) => (
          <div key={f.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border, #e5e5e5)" }}>
            <span style={{ minWidth: 130, fontWeight: 700 }}>{formatDay(f.dueDate, lang)}</span>
            <span>{t(`fuShort_${f.kind}` as StringKey)}{f.recurring ? ` (${t("fuYearly")})` : ""}</span>
            <Link to="/whatsapp-requests/$id" params={{ id: f.requestId }}>
              {f.requestRef}
            </Link>
            <span className="doc-sub" style={{ marginTop: 0 }}>
              {f.customerName ?? "—"} · {f.phoneMasked}
            </span>
            <span className={`status-pill ${f.status === "YES" ? "good" : f.status === "PENDING" || f.status === "SENT" ? "neutral" : "bad"}`}>
              {t(`fuSt_${f.status}` as StringKey)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
