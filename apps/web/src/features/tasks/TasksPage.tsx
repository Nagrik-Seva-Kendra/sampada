import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { TaskItem, TaskWorkType } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { useWaAssignees } from "../whatsapp/useWhatsappRequests";
import { useWaT } from "../whatsapp/waI18n";
import { formatDate } from "../whatsapp/waLabels";
import { useCreateTask, useTaskDocumentOpener, useTasks, useUpdateTask } from "./useTasks";
import "../whatsapp/waRequests.css";

type Tab = "today" | "overdue" | "upcoming" | "nodate" | "done";
const TABS: { key: Tab; label: StringKey }[] = [
  { key: "today", label: "tkTabToday" },
  { key: "overdue", label: "tkTabOverdue" },
  { key: "upcoming", label: "tkTabUpcoming" },
  { key: "nodate", label: "tkTabNoDate" },
  { key: "done", label: "tkTabDone" },
];
const WORK_KEY: Record<TaskWorkType, StringKey> = {
  sale: "tkTypeSale",
  mortgage: "tkTypeMortgage",
  agreement: "tkTypeAgreement",
  patta: "tkTypePatta",
  mutation: "tkTypeMutation",
  copy: "tkTypeCopy",
  will: "tkTypeWill",
  call: "tkTypeCall",
  collect_papers: "tkTypeCollect",
  other: "tkTypeOther",
};
const SOURCE_KEY: Record<string, StringKey> = { voice: "tkSourceVoice", text: "tkSourceText", web: "tkSourceWeb", broadcast: "tkSourceBroadcast" };
const IST = 5.5 * 3600 * 1000;
const istDayStart = (d: Date) => {
  const x = new Date(d.getTime() + IST);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - IST);
};

/** Which tab a task belongs to (days in IST, like the WhatsApp reminders). */
export function tabOf(t: Pick<TaskItem, "status" | "dueAt">, now: Date): Tab {
  if (t.status !== "OPEN") return "done";
  if (!t.dueAt) return "nodate";
  const due = new Date(t.dueAt);
  const today = istDayStart(now);
  if (due < today) return "overdue";
  return due.getTime() < today.getTime() + 864e5 ? "today" : "upcoming";
}

/** <input type="datetime-local"> value in the browser's time ↔ ISO. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/** "My Tasks": OWNER/ADMIN see everyone's (and assign); other staff only their own. */
export function TasksPage() {
  const { t, lang } = useWaT();
  const [assignee, setAssignee] = useState("");
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<TaskItem | "new" | null>(null);
  const query = useTasks(assignee);
  const canManage = query.data?.canManage ?? false;
  const staff = useWaAssignees(canManage);
  const update = useUpdateTask();
  const now = new Date();
  const all = query.data?.data ?? [];
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { today: 0, overdue: 0, upcoming: 0, nodate: 0, done: 0 };
    for (const x of all) c[tabOf(x, now)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);
  const rows = all.filter((x) => tabOf(x, now) === tab);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("tkKicker")}
        </div>
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="page-title">{t("tkTitle")}</h2>
          <button type="button" className="btn-calc" onClick={() => setEditing("new")}>
            + {t("tkNew")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          {TABS.map((x) => (
            <button key={x.key} type="button" className={tab === x.key ? "btn-calc" : "doc-btn"} onClick={() => setTab(x.key)}>
              {t(x.label)} {counts[x.key] > 0 && `(${counts[x.key]})`}
            </button>
          ))}
          {canManage && (
            <select className="dr-action-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{t("tkAllStaff")}</option>
              {(staff.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {query.isLoading && <Skeleton className="h-5 w-full" />}
        {query.isError && <p className="modal-error">{t("tkLoadError")}</p>}
        {!query.isLoading && !query.isError && rows.length === 0 && <p className="doc-sub">{t("tkEmpty")}</p>}
        {rows.map((x) => (
          <div key={x.id} className="dr-form" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>
                  #{x.number} · {x.title}
                </div>
                <div className="doc-sub" style={{ marginTop: 4 }}>
                  {[
                    t(WORK_KEY[x.workType] ?? "tkTypeOther"),
                    x.partyName,
                    x.partyPhone ? `+${x.partyPhone}` : null,
                    x.place,
                    x.dueAt ? formatDate(x.dueAt, lang) : null,
                    x.assigneeName ? `→ ${x.assigneeName}` : null,
                    t(SOURCE_KEY[x.source] ?? "tkSourceWeb"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {x.note && <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 14 }}>{x.note}</div>}
                {x.transcript && x.source === "voice" && (
                  <div className="doc-sub" style={{ marginTop: 6 }}>
                    🎙️ {t("tkTranscript")}: “{x.transcript}”
                  </div>
                )}
                {x.linkedRequestId && (
                  <Link to="/whatsapp-requests/$id" params={{ id: x.linkedRequestId }} className="doc-sub">
                    {t("tkLinkedRequest")} {x.linkedRequestId.slice(-6).toUpperCase()}
                  </Link>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {x.documentName && <TaskFileButton id={x.id} name={x.documentName} />}
                {x.partyPhone && (
                  <a className="doc-btn" href={`tel:+${x.partyPhone}`}>
                    📞
                  </a>
                )}
                <button type="button" className="doc-btn" onClick={() => setEditing(x)}>
                  {t("tkEdit")}
                </button>
                <button
                  type="button"
                  className={x.status === "OPEN" ? "btn-calc" : "doc-btn"}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: x.id, input: { status: x.status === "OPEN" ? "DONE" : "OPEN" } })}
                >
                  {x.status === "OPEN" ? t("tkMarkDone") : t("tkReopen")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <TaskDialog task={editing === "new" ? null : editing} canManage={canManage} staff={staff.data ?? []} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function TaskDialog({
  task,
  canManage,
  staff,
  onClose,
}: {
  task: TaskItem | null;
  canManage: boolean;
  staff: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { t } = useWaT();
  const create = useCreateTask();
  const update = useUpdateTask();
  const [f, setF] = useState({
    title: task?.title ?? "",
    partyName: task?.partyName ?? "",
    partyPhone: task?.partyPhone ?? "",
    workType: (task?.workType ?? "other") as TaskWorkType,
    place: task?.place ?? "",
    due: toLocalInput(task?.dueAt ?? null),
    note: task?.note ?? "",
    assigneeId: task?.assigneeId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      title: f.title.trim(),
      partyName: f.partyName.trim() || null,
      partyPhone: f.partyPhone.trim() || null,
      workType: f.workType,
      place: f.place.trim() || null,
      dueAt: f.due ? new Date(f.due).toISOString() : null,
      note: f.note.trim() || null,
      ...(canManage ? { assigneeId: f.assigneeId || null } : {}),
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(await apiErrorMessage(err, t("tkSaveError")));
    }
  }
  const field = (k: keyof typeof f) => ({ value: f[k] as string, onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{task ? t("tkEditTitle").replace("{n}", String(task.number)) : t("tkNew")}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t("tkCancel")}>
            ✕
          </button>
        </div>
        <form className="modal-form" onSubmit={onSubmit}>
          <label className="modal-field">
            {t("tkFieldTitle")}
            <input required maxLength={300} {...field("title")} autoFocus />
          </label>
          <label className="modal-field">
            {t("tkFieldType")}
            <select {...field("workType")}>
              {(Object.keys(WORK_KEY) as TaskWorkType[]).map((k) => (
                <option key={k} value={k}>
                  {t(WORK_KEY[k])}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            {t("tkFieldParty")}
            <input maxLength={120} {...field("partyName")} />
          </label>
          <label className="modal-field">
            {t("tkFieldPhone")}
            <input inputMode="tel" maxLength={20} {...field("partyPhone")} />
          </label>
          <label className="modal-field">
            {t("tkFieldPlace")}
            <input maxLength={200} {...field("place")} />
          </label>
          <label className="modal-field">
            {t("tkFieldDue")}
            <input type="datetime-local" {...field("due")} />
          </label>
          {canManage && (
            <label className="modal-field">
              {t("tkFieldAssignee")}
              <select {...field("assigneeId")}>
                <option value="">{t("tkNobody")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="modal-field">
            {t("tkFieldNote")}
            <textarea rows={3} maxLength={2000} {...field("note")} />
          </label>
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="btn-calc modal-submit" disabled={busy || !f.title.trim()}>
            {busy ? t("tkSaving") : t("tkSave")}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Opens the file the owner sent with the task on WhatsApp (new tab; falls back to a download). */
function TaskFileButton({ id, name }: { id: string; name: string }) {
  const { t } = useWaT();
  const open = useTaskDocumentOpener();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    // Opened before the fetch so the browser does not block it as a pop-up.
    const win = window.open("", "_blank");
    try {
      const url = await open(id);
      if (win) win.location.href = url;
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      win?.close();
      setErr(await apiErrorMessage(e, t("tkLoadError")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="doc-btn" disabled={busy} onClick={go} title={name}>
        {busy ? "…" : t("tkFile")}
      </button>
      {err && <span className="modal-error"> {err}</span>}
    </span>
  );
}
