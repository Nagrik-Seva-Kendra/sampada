import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { WaRegistryWhen, WaWorkStatus } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { ArchiveCopyPanel } from "./ArchiveCopyPanel";
import { BlockedPanel, FeesPanel } from "./BotSettingsPanels";
import { DeleteRequestDialog, takeWaToast } from "./DeleteRequestDialog";
import { useBulkDeleteWaRequests, useSubmitWaTemplates, useWaRequests, useWaSummary, useWaTemplates } from "./useWhatsappRequests";
import { DEED_TYPE_KEY, INTAKE_STATUS_KEY, useWaT, type WaT, WORK_STATUS_KEY } from "./waI18n";
import { formatAmount, formatDate, registryWhen, WORK_STATUS_PILL, WORK_STATUSES } from "./waLabels";
import "./waRequests.css";

const TEMPLATE_STATUS: Record<string, StringKey> = { APPROVED: "waTplAPPROVED", PENDING: "waTplPENDING", REJECTED: "waTplREJECTED", PAUSED: "waTplPAUSED" };

/**
 * OWNER/ADMIN: the WhatsApp templates used outside the 24-hour window, their
 * state at Meta, and a button to send them for approval.
 */
function TemplatesPanel() {
  const { t } = useWaT();
  const templates = useWaTemplates(true);
  const submit = useSubmitWaTemplates();
  const [msg, setMsg] = useState<string | null>(null);
  async function onSubmit() {
    setMsg(null);
    try {
      const out = await submit.mutateAsync();
      setMsg(out.map((o) => `${o.name}: ${templateResult(o, t)}`).join(" · "));
    } catch (err) {
      setMsg(await apiErrorMessage(err, t("waTplSubmitError")));
    }
  }
  return (
    <details style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{t("waTplTitle")}</summary>
      <div style={{ padding: "8px 0" }}>
        {templates.isError ? (
          <p className="doc-sub">{t("waTplLoadError")}</p>
        ) : (
          (templates.data ?? []).map((tpl) => (
            <div key={tpl.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
              <code>{tpl.name}</code>
              <span className={`status-pill ${tpl.status === "APPROVED" ? "good" : tpl.status ? "warn" : "bad"}`}>
                {tpl.status ? (TEMPLATE_STATUS[tpl.status] ? t(TEMPLATE_STATUS[tpl.status]!) : tpl.status) : t("waTplNotSubmitted")}
              </span>
            </div>
          ))
        )}
        <button type="button" className="doc-btn" style={{ marginTop: 6 }} disabled={submit.isPending} onClick={onSubmit}>
          {submit.isPending ? t("waSending") : t("waTplSubmit")}
        </button>
        {msg && <p className="doc-sub">{msg}</p>}
      </div>
    </details>
  );
}

/** Staff: draft requests customers submitted through the WhatsApp bot. */
export function WhatsappRequestsPage() {
  const { t, lang } = useWaT();
  const canManage = useWaSummary(true).data?.canManage ?? false;
  const [workStatus, setWorkStatus] = useState<WaWorkStatus | "">("");
  const [needsStaff, setNeedsStaff] = useState<"" | "true" | "false">("");
  const [registry, setRegistry] = useState<WaRegistryWhen | "">("");
  const query = useWaRequests({
    workStatus: workStatus || undefined,
    registry: registry || undefined,
    needsStaff: needsStaff === "" ? undefined : needsStaff === "true",
  });
  const rows = query.data?.data ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const bulk = useBulkDeleteWaRequests();
  const cols = canManage ? 10 : 9;

  // A message left by a delete (detail page) or set here; hides after a while.
  useEffect(() => {
    const m = takeWaToast();
    if (m) setToast(m);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  // Keep only rows still on screen (filters change, deleted rows vanish).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function onBulkDelete() {
    setBulkError(null);
    const ids = [...selected];
    try {
      const out = await bulk.mutateAsync({ ids, confirm: `DELETE ${ids.length}` });
      setBulkOpen(false);
      setSelected(new Set());
      const deeds = out.deleted.filter((d) => d.deedTemplateId).length;
      setToast(
        t("waDeletedMany", { n: out.deleted.length }) +
          (out.failed.length
            ? t("waDeleteFailedMany", { n: out.failed.length, list: out.failed.map((f) => `${f.ref} (${f.reason})`).join(", ") })
            : "") +
          (deeds ? t("waDeletedDeedsKept", { n: deeds }) : ""),
      );
    } catch (err) {
      setBulkError(await apiErrorMessage(err, t("waDeleteManyError")));
    }
  }
  const newCount = query.data?.newCount ?? 0;

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          WhatsApp
        </div>
        <div className="page-head">
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {t("waTitle")}
            {newCount > 0 && <span className="status-pill warn">{t("waNewCount", { n: newCount })}</span>}
          </h2>
        </div>

        {canManage && <TemplatesPanel />}
        {canManage && <FeesPanel />}
        {canManage && <BlockedPanel />}
        {canManage && <ArchiveCopyPanel />}

        {canManage && selected.size > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{t("waSelectedCount", { n: selected.size })}</span>
            <button type="button" className="wa-btn-delete" onClick={() => setBulkOpen(true)}>
              {t("waDeleteSelected")}
            </button>
            <button type="button" className="doc-btn" onClick={() => setSelected(new Set())}>
              {t("waClearSelection")}
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            {t("waFilterStatus")}
            <select
              className="dr-action-select"
              value={workStatus}
              onChange={(e) => setWorkStatus(e.target.value as WaWorkStatus | "")}
            >
              <option value="">{t("waFilterAll")}</option>
              {WORK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(WORK_STATUS_KEY[s])}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            {t("waFilterStaffCheck")}
            <select
              className="dr-action-select"
              value={needsStaff}
              onChange={(e) => setNeedsStaff(e.target.value as "" | "true" | "false")}
            >
              <option value="">{t("waFilterAll")}</option>
              <option value="true">{t("waFilterStaffNeeded")}</option>
              <option value="false">{t("waFilterStaffNotNeeded")}</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            {t("rgFilter")}
            <select className="dr-action-select" value={registry} onChange={(e) => setRegistry(e.target.value as WaRegistryWhen | "")}>
              <option value="">{t("waFilterAll")}</option>
              <option value="today">{t("rgFilterToday")}</option>
              <option value="tomorrow">{t("rgFilterTomorrow")}</option>
              <option value="week">{t("rgFilterWeek")}</option>
            </select>
          </label>
        </div>

        <div className="wa-table-wrap">
          <table className="wa-table">
            <colgroup>
              {canManage && <col className="wa-col-select" />}
              <col className="wa-col-ref" />
              <col className="wa-col-customer" />
              <col className="wa-col-buyer" />
              <col className="wa-col-property" />
              <col className="wa-col-amount" />
              <col className="wa-col-status" />
              <col className="wa-col-registry" />
              <col className="wa-col-assignee" />
              <col className="wa-col-date" />
            </colgroup>
            <thead>
              <tr>
                {canManage && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t("waSelectAll")}
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    />
                  </th>
                )}
                <th>{t("waColRef")}</th>
                <th>{t("waColCustomer")}</th>
                <th>{t("waColBuyer")}</th>
                <th>{t("waColProperty")}</th>
                <th>{t("waColAmount")}</th>
                <th>{t("waColStatus")}</th>
                <th>{t("rgColRegistry")}</th>
                <th>{t("waColAssignee")}</th>
                <th>{t("waColDate")}</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={cols}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {query.isError && (
                <tr>
                  <td colSpan={cols} className="doc-empty">
                    {t("waLoadError")}
                  </td>
                </tr>
              )}
              {!query.isLoading && !query.isError && rows.length === 0 && (
                <tr>
                  <td colSpan={cols} className="doc-empty">
                    {t("waEmpty")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  {canManage && (
                    <td>
                      <input type="checkbox" aria-label={t("waSelectOne", { ref: r.ref })} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                  )}
                  <td className="wa-nowrap" style={{ fontWeight: 700 }}>
                    <Link to="/whatsapp-requests/$id" params={{ id: r.id }}>
                      {r.ref}
                    </Link>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.customerName ?? undefined}>
                      {r.customerName || "—"}
                    </div>
                    <div className="doc-sub wa-nowrap">{r.phoneMasked}</div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.buyerName ?? undefined}>
                      {r.buyerName || "—"}
                    </div>
                    <div className="doc-sub wa-nowrap">{t(DEED_TYPE_KEY[r.deedType])}</div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.propertySummary ?? undefined}>
                      {r.propertySummary || "—"}
                    </div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={formatAmount(r.amount, r.amountMode, t)}>
                      {formatAmount(r.amount, r.amountMode, t)}
                    </div>
                  </td>
                  <td>
                    <div className="wa-badges">
                      {r.workStatus ? (
                        <span className={`status-pill ${WORK_STATUS_PILL[r.workStatus]}`}>
                          {t(WORK_STATUS_KEY[r.workStatus])}
                        </span>
                      ) : (
                        <span className="status-pill neutral">{t(INTAKE_STATUS_KEY[r.status])}</span>
                      )}
                      {r.needsStaff && <span className="status-pill bad">{t("waStaffCheck")}</span>}
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const w = registryWhen(r.schedule, lang, t);
                      return w ? (
                        <>
                          <div style={{ fontWeight: w.confirmed ? 700 : 400 }}>{w.text}</div>
                          <div className="doc-sub">{w.confirmed ? t("rgConfirmed") : t("rgPreferred")}</div>
                        </>
                      ) : (
                        "—"
                      );
                    })()}
                    {r.schedule?.geoTagMode === "STAFF" && !r.schedule.geoTagTakenAt && (
                      <div className="status-pill warn" style={{ marginTop: 4, display: "inline-block" }} title={t("rgGeoStaffBadge")}>
                        📸 {t("rgGeoStaffShort")}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.assigneeName ?? undefined}>
                      {r.assigneeName || "—"}
                    </div>
                  </td>
                  <td className="doc-sub" title={formatDate(r.createdAt, lang)}>
                    {formatDate(r.createdAt, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {bulkOpen && (
        <DeleteRequestDialog
          title={t("waDeleteTitleMany", { n: selected.size })}
          expected={`DELETE ${selected.size}`}
          prompt={t("waDeletePromptMany", { text: `DELETE ${selected.size}` })}
          note={t("waDeleteNoteMany")}
          busy={bulk.isPending}
          error={bulkError}
          onConfirm={onBulkDelete}
          onClose={() => {
            setBulkOpen(false);
            setBulkError(null);
          }}
        />
      )}
      {toast && (
        <div className="wa-toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </section>
  );
}

/** Result of one template submission, in the chosen language. */
function templateResult(o: { code?: string; status?: string | null; errorCode?: string | number | null; result: string }, t: WaT): string {
  if (o.code === "exists") return t("waTplResultExists");
  if (o.code === "submitted") return t("waTplResultSubmitted", { status: o.status ?? "PENDING" });
  if (o.code === "error") return t("waTplResultError", { code: String(o.errorCode ?? "-") });
  return o.result;
}
