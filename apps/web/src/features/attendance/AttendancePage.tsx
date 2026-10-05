import { useMemo, useRef, useState } from "react";
import type { AttendanceSettings, DayStatus, LeaveApplyInput, LeaveRequestItem, LeaveType, PunchResult, SalaryLine, StaffDay } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { loadModule } from "../../lib/lazy";
import { useActiveOrganization } from "../../stores/authStore";
import { useWaT, type WaT } from "../whatsapp/waI18n";
import {
  currentPosition,
  useApplyLeave,
  useAttendanceMonth,
  useAttendanceSettings,
  useDecideLeave,
  useDownload,
  useHolidayMutations,
  useLeaves,
  useMyToday,
  useOfficeNetwork,
  useOfficeNetworkActions,
  usePunch,
  useSalaryHistory,
  useSalaryMutations,
  useSalarySheet,
  useSaveSettings,
} from "./useAttendance";
import "../whatsapp/waRequests.css";

type Tab = "mine" | "today" | "leaves" | "month" | "settings" | "salary";
const IST = 5.5 * 3600 * 1000;
const istToday = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
const thisMonth = () => istToday().slice(0, 7);
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "");
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const statusKey = (s: DayStatus) => `atSt_${s}` as StringKey;
const SHORT: Record<DayStatus, string> = { present: "P", late: "L", halfDay: "½", field: "F", absent: "A", leave: "CL", halfLeave: "½L", off: "–", holiday: "H", future: "" };
const COLOR: Partial<Record<DayStatus, string>> = { present: "#16a34a", late: "#d97706", halfDay: "#d97706", field: "#2563eb", absent: "#dc2626", leave: "#7c3aed", halfLeave: "#7c3aed" };

/** The result of a punch in the UI's language. */
export function punchMessage(t: WaT, r: PunchResult | { code: "noGps" }): string {
  const at = "record" in r && r.record ? hm(r.record.at) : "";
  const m = "distanceM" in r && r.distanceM != null ? Math.round(r.distanceM) : "?";
  const km = "accuracyM" in r && r.accuracyM != null ? Math.max(1, Math.round(r.accuracyM / 1000)) : "?";
  return t(`atRes_${r.code}` as StringKey, { t: at, m, km });
}

/**
 * हाज़िरी: everyone marks their own IN / OUT / field work (GPS read once,
 * only on the button press) and applies for leave. OWNER/ADMIN also see
 * today, decide leave, view the month and set the rules. Salary: OWNER only
 * (the server refuses everyone else).
 */
export function AttendancePage() {
  const { t } = useWaT();
  const org = useActiveOrganization();
  const settings = useAttendanceSettings();
  const canManage = settings.data?.canManage ?? false;
  const isOwner = org?.role === "OWNER";
  const leaves = useLeaves();
  const pending = (leaves.data ?? []).filter((l) => l.status === "PENDING").length;
  const [tab, setTab] = useState<Tab>(isOwner ? "today" : "mine");
  const tabs: { key: Tab; label: StringKey; show: boolean; badge?: number }[] = [
    { key: "mine", label: "atTabMine", show: !isOwner },
    { key: "today", label: "atTabToday", show: canManage },
    { key: "leaves", label: "atTabLeaves", show: true, badge: canManage ? pending : 0 },
    { key: "month", label: "atTabMonth", show: true },
    { key: "settings", label: "atTabSettings", show: canManage },
    { key: "salary", label: "atTabSalary", show: isOwner },
  ];
  const active = tabs.find((x) => x.key === tab && x.show) ? tab : (tabs.find((x) => x.show)?.key ?? "mine");

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("atKicker")}
        </div>
        <div className="page-head">
          <h2 className="page-title">{t("atTitle")}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {tabs
            .filter((x) => x.show)
            .map((x) => (
              <button key={x.key} type="button" className={active === x.key ? "btn-calc" : "doc-btn"} onClick={() => setTab(x.key)}>
                {t(x.label)} {x.badge ? `(${x.badge})` : ""}
              </button>
            ))}
        </div>
        {settings.isLoading && <Skeleton className="h-5 w-full" />}
        {settings.isError && <p className="modal-error">{t("atLoadError")}</p>}
        {settings.data && (
          <>
            {active === "mine" && <MinePanel />}
            {active === "today" && <TodayPanel />}
            {active === "leaves" && <LeavesPanel items={leaves.data ?? []} canManage={canManage} />}
            {active === "month" && <MonthPanel canManage={canManage} />}
            {active === "settings" && <SettingsPanel settings={settings.data.settings} holidays={settings.data.holidays} />}
            {active === "salary" && <SalaryPanel />}
          </>
        )}
      </div>
    </section>
  );
}

function MinePanel() {
  const { t } = useWaT();
  const today = useMyToday();
  const punch = usePunch();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const d = today.data;

  async function press(kind: "IN" | "OUT" | "FIELD") {
    setMsg(null);
    setBusy(true);
    try {
      // On the office internet IN / OUT need no location (desktops have no GPS); otherwise read it once.
      // A computer that cannot give one still sends the press: the server decides (office network or "noGps").
      let pos: { lat: number; lng: number; accuracyM: number } | null = null;
      if (kind === "FIELD" || !d?.onOfficeNetwork) {
        try {
          pos = await currentPosition();
        } catch {
          pos = null;
        }
      }
      const r = await punch.mutateAsync({
        kind,
        ...(pos ? { lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracyM } : {}),
        ...(kind === "FIELD" ? { reason: reason.trim() } : {}),
      });
      setMsg({ text: punchMessage(t, r), ok: r.ok });
      if (r.code === "tooFar") setFieldOpen(true);
      if (r.ok && kind === "FIELD") {
        setFieldOpen(false);
        setReason("");
      }
    } catch (e) {
      setMsg({ text: await apiErrorMessage(e, t("atSaveError")), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="dr-form" style={{ marginBottom: 14 }}>
        {today.isLoading && <Skeleton className="h-5 w-full" />}
        {d && (
          <>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {dm(d.day)} · {t(statusKey(d.status))}
            </div>
            <div className="doc-sub" style={{ marginTop: 4 }}>
              {[d.in ? t("atInAt", { t: hm(d.in.at) }) : null, d.out ? t("atOutAt", { t: hm(d.out.at) }) : null, ...d.field.map((f) => `${t("atField")} ${hm(f.at)}${f.reason ? ` — ${f.reason}` : ""}`)]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {d.closedReason && <p className="doc-sub">{t("atClosedToday", { r: d.closedReason })}</p>}
            {d.onOfficeNetwork ? (
              <p className="doc-sub" style={{ fontWeight: 700 }}>
                🏢 {t("atOnOfficeNet")}
              </p>
            ) : (
              !d.officeConfigured && <p className="modal-error">{t("atNoOffice")}</p>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              {!d.in && (
                <button type="button" className="btn-calc" style={{ fontSize: 18, padding: "14px 22px" }} disabled={busy} onClick={() => press("IN")}>
                  {busy ? t(d.onOfficeNetwork ? "waSending" : "atGettingGps") : t("atIn")}
                </button>
              )}
              {d.in && !d.out && (
                <button type="button" className="btn-calc" style={{ fontSize: 18, padding: "14px 22px" }} disabled={busy} onClick={() => press("OUT")}>
                  {busy ? t(d.onOfficeNetwork ? "waSending" : "atGettingGps") : t("atOut")}
                </button>
              )}
              <button type="button" className="doc-btn" onClick={() => setFieldOpen((v) => !v)}>
                {t("atField")}
              </button>
            </div>
            {fieldOpen && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <input className="dr-action-select" style={{ flex: "1 1 240px" }} maxLength={500} placeholder={t("atFieldReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button type="button" className="btn-calc" disabled={busy || reason.trim().length < 2} onClick={() => press("FIELD")}>
                  {t("atFieldSave")}
                </button>
              </div>
            )}
            {msg && (
              <p className={msg.ok ? "doc-sub" : "modal-error"} style={{ marginTop: 10, fontWeight: 700 }} role="status">
                {msg.text}
              </p>
            )}
            <p className="doc-sub" style={{ marginTop: 10 }}>
              📍 {t("atLocationNote")}
            </p>
          </>
        )}
      </div>
      <LeaveForm />
    </div>
  );
}

function LeaveForm() {
  const { t } = useWaT();
  const apply = useApplyLeave();
  const tomorrow = new Date(Date.parse(`${istToday()}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState<LeaveApplyInput>({ fromDate: tomorrow, toDate: tomorrow, halfDay: false, type: "CASUAL", reason: "" });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await apply.mutateAsync({ ...f, toDate: f.toDate < f.fromDate ? f.fromDate : f.toDate, reason: f.reason.trim() });
      setMsg({ text: t("atLeaveSent", { n: r.number }), ok: true });
      setF({ ...f, reason: "" });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("atSaveError")), ok: false });
    }
  }
  return (
    <form className="dr-form" onSubmit={submit} style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("atLeaveApply")}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label className="modal-field">
          {t("atLeaveFrom")}
          <input type="date" required value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} />
        </label>
        <label className="modal-field">
          {t("atLeaveTo")}
          <input type="date" required value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} />
        </label>
        <label className="modal-field">
          {t("atLeaveType")}
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as LeaveType })}>
            {(["CASUAL", "SICK", "OTHER"] as const).map((k) => (
              <option key={k} value={k}>
                {t(`atLeave${k}` as StringKey)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={f.halfDay} onChange={(e) => setF({ ...f, halfDay: e.target.checked })} />
          {t("atLeaveHalf")}
        </label>
      </div>
      <label className="modal-field" style={{ marginTop: 8 }}>
        {t("atLeaveReason")}
        <input required minLength={2} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </label>
      <button type="submit" className="btn-calc" style={{ marginTop: 10 }} disabled={apply.isPending || f.reason.trim().length < 2}>
        {t("atLeaveSend")}
      </button>
      {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
    </form>
  );
}

function LeavesPanel({ items, canManage }: { items: LeaveRequestItem[]; canManage: boolean }) {
  const { t } = useWaT();
  const decide = useDecideLeave();
  const sorted = [...items].sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1));
  return (
    <div>
      {!canManage && <LeaveForm />}
      {sorted.length === 0 && <p className="doc-sub">{t("atNoLeaves")}</p>}
      {sorted.map((l) => (
        <div key={l.id} className="dr-form" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>
              #{l.number} · {l.userName} · {l.fromDate === l.toDate ? dm(l.fromDate) : `${dm(l.fromDate)} – ${dm(l.toDate)}`}
              {l.halfDay ? ` · ${t("atLeaveHalf")}` : ""}
            </div>
            <div className="doc-sub">
              {t(`atLeave${l.type}` as StringKey)} · {l.reason} · <b>{t(`atLeave${l.status}` as StringKey)}</b>
            </div>
          </div>
          {canManage && l.status === "PENDING" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-calc" disabled={decide.isPending} onClick={() => decide.mutate({ id: l.id, approve: true })}>
                {t("atApprove")}
              </button>
              <button type="button" className="doc-btn" disabled={decide.isPending} onClick={() => decide.mutate({ id: l.id, approve: false })}>
                {t("atReject")}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TodayPanel() {
  const { t } = useWaT();
  const day = istToday();
  const month = useAttendanceMonth(day.slice(0, 7), "");
  const rows: StaffDay[] = (month.data?.staff ?? []).map((s) => s.days.find((d) => d.day === day)!).filter(Boolean);
  return (
    <div className="dr-form" style={{ overflowX: "auto" }}>
      {month.isLoading && <Skeleton className="h-5 w-full" />}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>{t("atStaff")}</th>
            <th>{t("atStatus")}</th>
            <th>IN</th>
            <th>OUT</th>
            <th>{t("atField")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} style={{ borderTop: "1px solid var(--line, #e5e7eb)" }}>
              <td style={{ padding: "6px 4px", fontWeight: 700 }}>{r.name}</td>
              <td style={{ color: COLOR[r.status] }}>{t(statusKey(r.status))}{r.lateMin > 0 && (r.status === "late" || r.status === "halfDay") ? ` (+${r.lateMin}m)` : ""}</td>
              <td>{hm(r.inAt)}</td>
              <td>{hm(r.outAt)}</td>
              <td>{r.field.map((f) => `${hm(f.at)}${f.reason ? ` ${f.reason}` : ""}`).join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthPanel({ canManage }: { canManage: boolean }) {
  const { t } = useWaT();
  const [month, setMonth] = useState(thisMonth());
  const [userId, setUserId] = useState("");
  const all = useAttendanceMonth(month, "", canManage);
  const data = useAttendanceMonth(month, userId);
  const download = useDownload();
  const tableRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function pdf() {
    if (!tableRef.current) return;
    setBusy(true);
    try {
      const [{ jsPDF }, html2canvas] = await Promise.all([loadModule(() => import("jspdf")), loadModule(() => import("html2canvas").then((m) => m.default))]);
      const canvas = await html2canvas(tableRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const w = doc.internal.pageSize.getWidth() - 40;
      const h = Math.min(doc.internal.pageSize.getHeight() - 40, (canvas.height * w) / canvas.width);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 20, 20, (canvas.width * h) / canvas.height, h);
      doc.save(`attendance-${month}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  const days = data.data?.days ?? [];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="month" className="dr-action-select" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        {canManage && (
          <select className="dr-action-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t("atAllStaff")}</option>
            {(all.data?.staff ?? []).map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="doc-btn" onClick={() => download("attendance/month/export", { month, ...(userId ? { userId } : {}) }, `attendance-${month}.xlsx`)}>
          ⬇ {t("atExcel")}
        </button>
        <button type="button" className="doc-btn" disabled={busy} onClick={pdf}>
          ⬇ {t("atPdf")}
        </button>
      </div>
      {data.isLoading && <Skeleton className="h-5 w-full" />}
      <div style={{ overflowX: "auto" }}>
        <div ref={tableRef} style={{ background: "#fff", color: "#111", padding: 8, display: "inline-block", minWidth: "100%" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            {t("atTitle")} — {month}
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "2px 6px" }}>{t("atStaff")}</th>
                {days.map((d) => (
                  <th key={d} style={{ padding: "2px 3px", minWidth: 22 }}>
                    {d.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.data?.staff ?? []).map((s) => (
                <tr key={s.userId} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "2px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>{s.name}</td>
                  {s.days.map((d) => (
                    <td
                      key={d.day}
                      title={`${t(statusKey(d.status))}${d.inAt ? ` · IN ${hm(d.inAt)}` : ""}${d.outAt ? ` · OUT ${hm(d.outAt)}` : ""}`}
                      style={{ textAlign: "center", color: COLOR[d.status] ?? "#9ca3af", fontWeight: 700 }}
                    >
                      {SHORT[d.status]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 11 }}>
            {(Object.keys(SHORT) as DayStatus[])
              .filter((k) => SHORT[k])
              .map((k) => `${SHORT[k]} = ${t(statusKey(k))}`)
              .join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}

/** OWNER/ADMIN: the office internet — computers on it mark IN / OUT without GPS. Added from the office itself. */
function OfficeNetworkPanel() {
  const { t } = useWaT();
  const q = useOfficeNetwork(true);
  const a = useOfficeNetworkActions();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok, ok: true });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("atSaveError")), ok: false });
    }
  };
  const d = q.data;
  return (
    <div className="dr-form" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800 }}>🏢 {t("atNetTitle")}</div>
      <p className="doc-sub" style={{ margin: "4px 0 8px" }}>
        {t("atNetHint")}
      </p>
      {q.isError && <p className="modal-error">{t("atSaveError")}</p>}
      {d && (
        <>
          <p className="doc-sub">
            {t("atNetYourIp", { ip: d.yourIp ?? "—" })} {d.yourIpMatches ? `✅ ${t("atNetIsOffice")}` : ""}
          </p>
          {d.networks.length === 0 ? (
            <p className="doc-sub">{t("atNetNone")}</p>
          ) : (
            <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
              {d.networks.map((n) => (
                <li key={n.ip} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <code>{n.ip}</code>
                  <span className="doc-sub">{new Date(n.addedAt).toLocaleDateString("en-IN")}</span>
                  <button type="button" className="doc-btn" disabled={a.remove.isPending} onClick={() => run(() => a.remove.mutateAsync(n.ip), t("atSaved"))}>
                    {t("atNetRemove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!d.yourIpMatches && (
            <button type="button" className="btn-calc" disabled={a.add.isPending || !d.yourIp} onClick={() => run(() => a.add.mutateAsync(), t("atNetAdded"))}>
              {t("atNetAdd")}
            </button>
          )}
        </>
      )}
      {msg && (
        <p className={msg.ok ? "doc-sub" : "modal-error"} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}

function SettingsPanel({ settings, holidays }: { settings: AttendanceSettings; holidays: { id: string; date: string; name: string }[] }) {
  const { t } = useWaT();
  const save = useSaveSettings();
  const hol = useHolidayMutations();
  const [f, setF] = useState<AttendanceSettings>(settings);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [h, setH] = useState({ date: "", name: "" });
  const num = (k: keyof AttendanceSettings) => ({
    type: "number",
    value: String(f[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) }),
  });
  async function here() {
    try {
      const p = await currentPosition();
      // A computer's guess (100+ km off) would put the office in the wrong place.
      if (p.accuracyM > 1000) {
        setMsg({ text: t("atOfficeHereRough", { km: Math.round(p.accuracyM / 1000) }), ok: false });
        return;
      }
      setF({ ...f, officeLat: Number(p.lat.toFixed(6)), officeLng: Number(p.lng.toFixed(6)) });
    } catch {
      setMsg({ text: t("atRes_noGps"), ok: false });
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await save.mutateAsync(f);
      setMsg({ text: t("atSaved"), ok: true });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("atSaveError")), ok: false });
    }
  }
  return (
    <div>
      <form className="dr-form" onSubmit={submit} style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800 }}>{t("atOfficeLocation")}</div>
        <div className="doc-sub" style={{ margin: "4px 0 8px" }}>
          {f.officeLat != null && f.officeLng != null ? t("atOfficeSet", { lat: f.officeLat, lng: f.officeLng }) : t("atOfficeNotSet")}
        </div>
        <button type="button" className="doc-btn" onClick={here}>
          📍 {t("atOfficeHere")}
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 12 }}>
          <label className="modal-field">
            {t("atRadius")}
            <input {...num("radiusM")} min={20} max={5000} />
          </label>
          <label className="modal-field">
            {t("atStart")}
            <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          </label>
          <label className="modal-field">
            {t("atEnd")}
            <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          </label>
          <label className="modal-field">
            {t("atLateAfter")}
            <input {...num("lateAfterMin")} min={0} max={240} />
          </label>
          <label className="modal-field">
            {t("atHalfAfter")}
            <input {...num("halfDayAfterMin")} min={0} max={480} />
          </label>
          <label className="modal-field">
            {t("atPaidLeave")}
            <input {...num("paidLeavePerMonth")} min={0} max={10} step={0.5} />
          </label>
          <label className="modal-field">
            {t("atLateDeduction")}
            <input {...num("lateDeductionDay")} min={0} max={1} step={0.05} />
          </label>
        </div>
        <div style={{ marginTop: 10 }}>
          <div>{t("atWeeklyOff")}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <label key={d} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={f.weeklyOff.includes(d)}
                  onChange={(e) => setF({ ...f, weeklyOff: e.target.checked ? [...f.weeklyOff, d].sort() : f.weeklyOff.filter((x) => x !== d) })}
                />
                {t(`atDay${d}` as StringKey)}
              </label>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" checked={f.reportsEnabled} onChange={(e) => setF({ ...f, reportsEnabled: e.target.checked })} />
          {t("atReports")}
        </label>
        <button type="submit" className="btn-calc" style={{ marginTop: 12 }} disabled={save.isPending}>
          {t("atSave")}
        </button>
        {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
      </form>
      <OfficeNetworkPanel />
      <div className="dr-form">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("atHolidays")}</div>
        {holidays.map((x) => (
          <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
            <span style={{ minWidth: 90 }}>{x.date}</span>
            <span style={{ flex: 1 }}>{x.name}</span>
            <button type="button" className="doc-btn" onClick={() => hol.remove.mutate(x.id)}>
              {t("atRemove")}
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input type="date" className="dr-action-select" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
          <input className="dr-action-select" placeholder={t("atHolidayName")} maxLength={100} value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
          <button
            type="button"
            className="btn-calc"
            disabled={!h.date || !h.name.trim() || hol.add.isPending}
            onClick={() => hol.add.mutate({ date: h.date, name: h.name.trim() }, { onSuccess: () => setH({ date: "", name: "" }) })}
          >
            {t("atHolidayAdd")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SalaryPanel() {
  const { t } = useWaT();
  const [month, setMonth] = useState(() => {
    const d = new Date(Date.parse(`${thisMonth()}-01T00:00:00Z`) - 864e5); // last month by default
    return d.toISOString().slice(0, 7);
  });
  const staff = useAttendanceMonth(thisMonth(), "");
  const sheet = useSalarySheet(month, true);
  const m = useSalaryMutations(month);
  const download = useDownload();
  const [rate, setRate] = useState({ userId: "", monthly: "", effectiveFrom: istToday() });
  const history = useSalaryHistory(rate.userId);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [edit, setEdit] = useState<SalaryLine | null>(null);
  const final = sheet.data?.status === "FINAL";

  async function run(p: Promise<unknown>, ok?: string) {
    setMsg(null);
    try {
      await p;
      if (ok) setMsg({ text: ok, ok: true });
    } catch (e) {
      setMsg({ text: await apiErrorMessage(e, t("atSaveError")), ok: false });
    }
  }
  const total = useMemo(() => (sheet.data?.lines ?? []).reduce((a, l) => a + l.payable, 0), [sheet.data]);

  return (
    <div>
      <div className="dr-form" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("atSalaryRates")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="modal-field">
            {t("atStaff")}
            <select value={rate.userId} onChange={(e) => setRate({ ...rate, userId: e.target.value })}>
              <option value="">—</option>
              {(staff.data?.staff ?? []).map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            {t("atSalaryAmount")}
            <input type="number" min={0} value={rate.monthly} onChange={(e) => setRate({ ...rate, monthly: e.target.value })} />
          </label>
          <label className="modal-field">
            {t("atSalaryFrom")}
            <input type="date" value={rate.effectiveFrom} onChange={(e) => setRate({ ...rate, effectiveFrom: e.target.value })} />
          </label>
          <button
            type="button"
            className="btn-calc"
            disabled={!rate.userId || rate.monthly === "" || !rate.effectiveFrom || m.setRate.isPending}
            onClick={() => run(m.setRate.mutateAsync({ userId: rate.userId, monthly: Math.round(Number(rate.monthly)), effectiveFrom: rate.effectiveFrom }), t("atSaved"))}
          >
            {t("atSave")}
          </button>
        </div>
        {rate.userId && (history.data?.length ?? 0) > 0 && (
          <div className="doc-sub" style={{ marginTop: 8 }}>
            {t("atSalaryHistory")}: {history.data!.map((h) => `${rupees(h.monthly)} (${h.effectiveFrom})`).join(" → ")}
          </div>
        )}
      </div>

      <div className="dr-form">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <b>{t("atSalarySheet")}</b>
          <input type="month" className="dr-action-select" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          {sheet.data && <span className="doc-sub">{final ? t("atSalaryFinal") : t("atSalaryDraft")}</span>}
          <button type="button" className="doc-btn" onClick={() => download(`attendance/salary/sheet/${month}/export`, {}, `salary-${month}.xlsx`)}>
            ⬇ {t("atExcel")}
          </button>
          {!final && sheet.data && sheet.data.lines.length > 0 && (
            <button type="button" className="btn-calc" onClick={() => window.confirm(t("atSalaryFinalizeConfirm", { m: month })) && run(m.finalize.mutateAsync())}>
              {t("atSalaryFinalize")}
            </button>
          )}
        </div>
        {sheet.isLoading && <Skeleton className="h-5 w-full" />}
        {sheet.isError && <p className="modal-error">{t("atSalaryOwnerOnly")}</p>}
        {sheet.data && sheet.data.lines.length === 0 && <p className="doc-sub">{t("atSalaryEmpty")}</p>}
        {sheet.data && sheet.data.lines.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "right" }}>
                  <th style={{ textAlign: "left" }}>{t("atStaff")}</th>
                  <th>{t("atSalaryAmount")}</th>
                  <th>{t("atColWorking")}</th>
                  <th>{t("atColPerDay")}</th>
                  <th>{t("atColPresent")}</th>
                  <th>{t("atColHalf")}</th>
                  <th>{t("atColLate")}</th>
                  <th>{t("atColPaidLeave")}</th>
                  <th>{t("atColUnpaid")}</th>
                  <th>{t("atColAbsent")}</th>
                  <th>{t("atColDeduction")}</th>
                  <th>{t("atColBonus")}</th>
                  <th>{t("atColAdvance")}</th>
                  <th>{t("atColOther")}</th>
                  <th>{t("atColPayable")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sheet.data.lines.map((l) => (
                  <tr key={l.userId} style={{ borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                    <td style={{ textAlign: "left", fontWeight: 700, padding: "4px" }}>
                      {l.name}
                      {l.note && <div className="doc-sub">{l.note}</div>}
                    </td>
                    <td>{rupees(l.monthly)}</td>
                    <td>{l.workingDays}</td>
                    <td>{rupees(l.perDay)}</td>
                    <td>{l.present}</td>
                    <td>{l.halfDays}</td>
                    <td>{l.lateCount}</td>
                    <td>{l.paidLeave}</td>
                    <td>{l.unpaidLeave}</td>
                    <td>{l.absent}</td>
                    <td>{rupees(l.deduction)}</td>
                    <td>{rupees(l.bonus)}</td>
                    <td>{rupees(l.advance)}</td>
                    <td>{rupees(l.otherDeduction)}</td>
                    <td style={{ fontWeight: 800 }}>{rupees(l.payable)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {!final && (
                        <button type="button" className="doc-btn" onClick={() => setEdit(l)}>
                          ✎
                        </button>
                      )}
                      {final && (
                        <button
                          type="button"
                          className="doc-btn"
                          disabled={m.send.isPending}
                          onClick={() =>
                            m.send.mutateAsync(l.userId).then(
                              (r) => setMsg({ text: r.sent ? t("atSalarySentOk") : t("atSalarySentNo", { r: r.reason ?? "" }), ok: r.sent }),
                              async (e) => setMsg({ text: await apiErrorMessage(e, t("atSaveError")), ok: false }),
                            )
                          }
                        >
                          {t("atSalarySend")} {sheet.data!.sentTo.includes(l.userId) ? `✓ ${t("atSalarySentMark")}` : ""}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #111", textAlign: "right", fontWeight: 800 }}>
                  <td colSpan={14} />
                  <td>{rupees(total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
      </div>
      {edit && <AdjustDialog line={edit} onClose={() => setEdit(null)} onSave={(input) => run(m.adjust.mutateAsync(input)).then(() => setEdit(null))} />}
    </div>
  );
}

function AdjustDialog({
  line,
  onClose,
  onSave,
}: {
  line: SalaryLine;
  onClose: () => void;
  onSave: (i: { userId: string; bonus: number; advance: number; otherDeduction: number; note: string | null }) => void;
}) {
  const { t } = useWaT();
  const [f, setF] = useState({ bonus: String(line.bonus), advance: String(line.advance), otherDeduction: String(line.otherDeduction), note: line.note ?? "" });
  const n = (s: string) => Math.max(0, Math.round(Number(s) || 0));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{line.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="✕">
            ✕
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ userId: line.userId, bonus: n(f.bonus), advance: n(f.advance), otherDeduction: n(f.otherDeduction), note: f.note.trim() || null });
          }}
        >
          {(["bonus", "advance", "otherDeduction"] as const).map((k) => (
            <label key={k} className="modal-field">
              {t(k === "bonus" ? "atColBonus" : k === "advance" ? "atColAdvance" : "atColOther")}
              <input type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </label>
          ))}
          <label className="modal-field">
            {t("atColNote")}
            <input maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
          <button type="submit" className="btn-calc modal-submit">
            {t("atSave")}
          </button>
        </form>
      </div>
    </div>
  );
}
