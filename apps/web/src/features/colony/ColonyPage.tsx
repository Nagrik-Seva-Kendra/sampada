import { useEffect, useState } from "react";
import {
  type ColonyBuyer,
  type ColonyProject,
  type ColonyProjectInput,
  type ColonySale,
  type ColonySaleInput,
  FLORA_CITY_DEFAULTS,
  type Instalment,
  type PaymentMode,
} from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { useActiveOrganization } from "../../stores/authStore";
import { useWaT } from "../whatsapp/waI18n";
import { formatDate } from "../whatsapp/waLabels";
import { useColonyActions, useColonyData, useColonyProjects } from "./useColony";
import "../whatsapp/waRequests.css";

type Tab = "dashboard" | "sales" | "plots" | "setup";
const inr = (n: number) => n.toLocaleString("en-IN");
const MODES: PaymentMode[] = ["rtgs", "cheque", "upi", "cash", "dd", "loan"];
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const emptyBuyer = (): ColonyBuyer => ({ name: "", relation: "पुत्र", guardian: "", motherName: "", address: "", mobile: "", email: "", aadhaar: "", pan: "" });

/** Colony auto-draft: project setup (OWNER/ADMIN), plot master, sales and deeds, dashboard. */
export function ColonyPage() {
  const { t } = useWaT();
  const org = useActiveOrganization();
  const canManage = org?.role === "OWNER" || org?.role === "ADMIN";
  const isOwner = org?.role === "OWNER";
  const projects = useColonyProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const a = useColonyActions(projectId);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId && projects.data?.length) setProjectId(projects.data[0]!.id);
  }, [projects.data, projectId]);
  const project = projects.data?.find((p) => p.id === projectId) ?? null;

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("coKicker")}
        </div>
        <div className="page-head">
          <h2 className="page-title">{t("coTitle")}</h2>
        </div>
        {projects.isLoading && <Skeleton className="h-5 w-full" />}
        {error && <p className="modal-error">{error}</p>}
        {projects.data && !projects.data.length && (
          <div className="dr-form">
            <p className="doc-sub">{t("coNone")}</p>
            {canManage && (
              <button
                type="button"
                className="btn-calc"
                disabled={a.create.isPending}
                onClick={() =>
                  a.create.mutateAsync(FLORA_CITY_DEFAULTS).then(
                    (p) => setProjectId(p.id),
                    async (e) => setError(await apiErrorMessage(e, t("coSaveError"))),
                  )
                }
              >
                {t("coCreateFlora")}
              </button>
            )}
          </div>
        )}
        {project && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              {(projects.data ?? []).length > 1 && (
                <select className="dr-action-select" value={project.id} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.data!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <b>{project.name}</b>
              <span className={`status-pill ${project.live ? "good" : "warn"}`}>{project.live ? t("coLive") : t("coNotLive")}</span>
              {(["dashboard", "sales", "plots", ...(canManage ? ["setup"] : [])] as Tab[]).map((k) => (
                <button key={k} type="button" className={tab === k ? "btn-calc" : "doc-btn"} onClick={() => setTab(k)}>
                  {t(`coTab${k[0]!.toUpperCase()}${k.slice(1)}` as StringKey)}
                </button>
              ))}
            </div>
            {tab === "dashboard" && <DashboardTab project={project} isOwner={isOwner} />}
            {tab === "sales" && <SalesTab project={project} />}
            {tab === "plots" && <PlotsTab projectId={project.id} canManage={canManage} />}
            {tab === "setup" && canManage && <SetupTab project={project} />}
          </>
        )}
      </div>
    </section>
  );
}

function DashboardTab({ project, isOwner }: { project: ColonyProject; isOwner: boolean }) {
  const { t } = useWaT();
  const { dashboard } = useColonyData(project.id);
  const a = useColonyActions(project.id);
  const [error, setError] = useState<string | null>(null);
  const d = dashboard.data;
  return (
    <div className="dr-form">
      {d && (
        <>
          <p style={{ fontWeight: 700 }}>{t("coPlotsTotal", { total: d.plots.total, a: d.plots.available, d: d.plots.drafted, s: d.plots.sold })}</p>
          <p style={{ fontWeight: 700 }}>{t("coSalesTotal", { n: d.sales.total, deeds: d.sales.deeds, sum: inr(d.sales.consideration) })}</p>
          <p className="doc-sub">{t("coSalesProblems", { e: d.sales.withErrors, w: d.sales.withWarnings })}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {d.plots.byBlock.map((b) => (
              <span key={b.block} className="status-pill neutral">
                {t("coBlock")} {b.block}: {b.available}/{b.total} {t("coAvailable")}
              </span>
            ))}
          </div>
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <b>{t("coReadiness")}</b>
        {project.readiness.length ? (
          project.readiness.map((r) => (
            <div key={r} className="modal-error" style={{ margin: "2px 0" }}>
              • {r}
            </div>
          ))
        ) : (
          <p className="doc-sub">{t("coReady")}</p>
        )}
        {isOwner ? (
          <button
            type="button"
            className={project.live ? "doc-btn" : "btn-calc"}
            style={{ marginTop: 8 }}
            disabled={a.live.isPending || (!project.live && project.readiness.length > 0)}
            onClick={() => a.live.mutateAsync(!project.live).catch(async (e) => setError(await apiErrorMessage(e, t("coSaveError"))))}
          >
            {project.live ? t("coStopLive") : t("coGoLive")}
          </button>
        ) : (
          <p className="doc-sub">{t("coOwnerLive")}</p>
        )}
        {error && <p className="modal-error">{error}</p>}
      </div>
    </div>
  );
}

function ImportBox({ hint, onFile, busy }: { hint: string; onFile: (f: File) => Promise<{ added: number; updated: number; errors: { row: number; reason: string }[] }>; busy: boolean }) {
  const { t } = useWaT();
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ row: number; reason: string }[]>([]);
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="doc-btn" style={{ display: "inline-block", cursor: busy ? "wait" : "pointer" }}>
        ⬆ {t("coImport")}
        <input
          type="file"
          accept=".xlsx,.csv,text/csv"
          style={{ display: "none" }}
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setMsg(null);
            setErrors([]);
            try {
              const r = await onFile(f);
              setMsg(t("coImported", { a: r.added, u: r.updated }));
              setErrors(r.errors);
            } catch (err) {
              setMsg(await apiErrorMessage(err, t("coSaveError")));
            }
          }}
        />
      </label>
      <div className="doc-sub">{hint}</div>
      {msg && <div className="doc-sub" style={{ fontWeight: 700 }}>{msg}</div>}
      {errors.length > 0 && (
        <div className="modal-error">
          {t("coImportErrors")} {errors.map((e) => `${t("coRow", { n: e.row })}: ${e.reason}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function PlotsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { t } = useWaT();
  const { plots } = useColonyData(projectId);
  const a = useColonyActions(projectId);
  return (
    <div className="dr-form" style={{ overflowX: "auto" }}>
      {canManage && <ImportBox hint={t("coImportPlotsHint")} busy={a.importPlots.isPending} onFile={(f) => a.importPlots.mutateAsync(f)} />}
      <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>{t("coBlock")}</th>
            <th>{t("coPlot")}</th>
            <th>फुट</th>
            <th>वर्गफुट</th>
            <th>पूर्व</th>
            <th>पश्चिम</th>
            <th>उत्तर</th>
            <th>दक्षिण</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(plots.data ?? []).map((p) => (
            <tr key={p.id} style={{ borderTop: "1px solid #e5e7eb" }}>
              <td>{p.block}</td>
              <td>{p.plotNo}</td>
              <td>{p.ewFt && p.nsFt ? `${p.ewFt} x ${p.nsFt}` : "—"}</td>
              <td>{p.areaSqft ?? "—"}</td>
              <td>{p.east ?? "—"}</td>
              <td>{p.west ?? "—"}</td>
              <td>{p.north ?? "—"}</td>
              <td>{p.south ?? "—"}</td>
              <td>
                <span className={`status-pill ${p.status === "AVAILABLE" ? "good" : p.status === "SOLD" ? "neutral" : "warn"}`}>{t(`coSt_${p.status}` as StringKey)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalesTab({ project }: { project: ColonyProject }) {
  const { t, lang } = useWaT();
  const { sales } = useColonyData(project.id);
  const a = useColonyActions(project.id);
  const [editing, setEditing] = useState<ColonySale | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<unknown>) => p.catch(async (e) => setError(await apiErrorMessage(e, t("coSaveError"))));
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className="btn-calc" onClick={() => setEditing("new")}>
          + {t("coNewSale")}
        </button>
        <ImportBox hint={t("coImportSalesHint")} busy={a.importSales.isPending} onFile={(f) => a.importSales.mutateAsync(f)} />
      </div>
      {error && <p className="modal-error">{error}</p>}
      {sales.data && !sales.data.length && <p className="doc-sub">{t("coNoSales")}</p>}
      {(sales.data ?? []).map((s) => (
        <div key={s.id} className="dr-form" style={{ marginBottom: 10, opacity: s.status === "CANCELLED" ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>
                #{s.number} · {s.plotLabel} · {s.buyers.map((b) => b.name).join(", ")} ·{" "}
                <span className={`status-pill ${s.status === "DEED_CREATED" ? "good" : s.status === "CANCELLED" ? "bad" : "warn"}`}>{t(`coSaleSt_${s.status}` as StringKey)}</span>
              </div>
              <div className="doc-sub">
                ₹{inr(s.consideration)} · {t(`coSrc_${s.source}` as StringKey)} · {formatDate(s.createdAt, lang)}
              </div>
              {s.checks.map((c) => (
                <div key={c.code + c.message} className={c.level === "error" ? "modal-error" : "doc-sub"} style={{ margin: "2px 0" }}>
                  {c.level === "error" ? "⛔" : "⚠️"} {c.message}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              {s.status === "DRAFT" && (
                <>
                  <button type="button" className="doc-btn" onClick={() => setEditing(s)}>
                    {t("coEdit")}
                  </button>
                  <button
                    type="button"
                    className={!project.live || s.checks.some((c) => c.level === "error") ? "doc-btn" : "btn-calc"}
                    disabled={a.deed.isPending || !project.live || s.checks.some((c) => c.level === "error")}
                    onClick={() => run(a.deed.mutateAsync(s.id))}
                  >
                    {t("coMakeDeed")}
                  </button>
                </>
              )}
              {s.deedId && (
                <a className="doc-btn" href={`/deeds/${s.deedType ?? "sale-deed"}/edit/${s.deedId}`} target="_blank" rel="noreferrer">
                  {t("coOpenDeed")}
                </a>
              )}
              {s.status !== "CANCELLED" && (
                <button type="button" className="doc-btn" onClick={() => window.confirm(t("coCancelConfirm", { n: s.number })) && run(a.cancelSale.mutateAsync(s.id))}>
                  {t("coCancelSale")}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {editing && <SaleDialog project={project} sale={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SaleDialog({ project, sale, onClose }: { project: ColonyProject; sale: ColonySale | null; onClose: () => void }) {
  const { t } = useWaT();
  const { plots } = useColonyData(project.id);
  const a = useColonyActions(project.id);
  const [f, setF] = useState<ColonySaleInput>(() => ({
    plotId: sale?.plotId ?? "",
    partnerKey: sale?.partnerKey || project.partners[0]?.key || "",
    consideration: sale?.consideration ?? 0,
    instalments: sale?.instalments?.length ? sale.instalments : [{ date: today(), amount: 0, mode: "rtgs", ref: "" }],
    buyers: sale ? sale.buyers.map((b) => ({ ...emptyBuyer(), ...b, aadhaar: "", pan: "" })) : [emptyBuyer()],
  }));
  const [error, setError] = useState<string | null>(null);
  const total = f.instalments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const setBuyer = (i: number, patch: Partial<ColonyBuyer>) => setF({ ...f, buyers: f.buyers.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setInst = (i: number, patch: Partial<Instalment>) => setF({ ...f, instalments: f.instalments.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (sale) await a.updateSale.mutateAsync({ id: sale.id, input: f });
      else await a.createSale.mutateAsync(f);
      onClose();
    } catch (err) {
      setError(await apiErrorMessage(err, t("coSaveError")));
    }
  }
  const available = (plots.data ?? []).filter((p) => p.status === "AVAILABLE" || p.id === sale?.plotId);
  const text = (i: number, k: keyof ColonyBuyer, label: StringKey, extra: Record<string, unknown> = {}) => (
    <label className="modal-field">
      {t(label)}
      <input value={String(f.buyers[i]![k] ?? "")} onChange={(e) => setBuyer(i, { [k]: e.target.value } as Partial<ColonyBuyer>)} {...extra} />
    </label>
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--form" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{sale ? t("coEditSale", { n: sale.number }) : t("coNewSale")}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t("coCancel")}>
            ✕
          </button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="modal-field" style={{ flex: "1 1 200px" }}>
              {t("coPlot")}
              <select required value={f.plotId} disabled={!!sale} onChange={(e) => setF({ ...f, plotId: e.target.value })}>
                <option value="">—</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t("coBlock")} {p.block} - {t("coPlot")} {p.plotNo} {p.areaSqft ? `(${p.areaSqft} वर्गफुट)` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="modal-field" style={{ flex: "1 1 200px" }}>
              {t("coPartner")}
              <select value={f.partnerKey} onChange={(e) => setF({ ...f, partnerKey: e.target.value })}>
                {project.partners.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {f.buyers.map((b, i) => (
            <fieldset key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
              <legend style={{ fontWeight: 700 }}>{t("coBuyer", { n: i + 1 })}</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {text(i, "name", "coName", { required: true, minLength: 2 })}
                <label className="modal-field">
                  {t("coRelation")}
                  <select value={b.relation} onChange={(e) => setBuyer(i, { relation: e.target.value as ColonyBuyer["relation"] })}>
                    {(["पुत्र", "पुत्री", "पत्नी"] as const).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                {text(i, "guardian", "coGuardian")}
                {text(i, "motherName", "coMother")}
                {text(i, "address", "coAddress")}
                {text(i, "mobile", "coMobile", { inputMode: "tel" })}
                {text(i, "email", "coEmail", { type: "email" })}
                {text(i, "aadhaar", "coAadhaar", { inputMode: "numeric", autoComplete: "off", placeholder: sale?.buyers[i]?.aadhaarMasked ? t("coAadhaarKeep", { m: sale.buyers[i]!.aadhaarMasked! }) : "" })}
                {text(i, "pan", "coPan", { autoComplete: "off", placeholder: sale?.buyers[i]?.panMasked ?? "" })}
              </div>
            </fieldset>
          ))}
          {f.buyers.length < 4 && (
            <button type="button" className="doc-btn" onClick={() => setF({ ...f, buyers: [...f.buyers, emptyBuyer()] })}>
              {t("coAddBuyer")}
            </button>
          )}
          <label className="modal-field">
            {t("coConsideration")}
            <input type="number" min={1} required value={f.consideration || ""} onChange={(e) => setF({ ...f, consideration: Math.round(Number(e.target.value) || 0) })} />
          </label>
          <div style={{ fontWeight: 700 }}>{t("coInstalments")}</div>
          {f.instalments.map((x, i) => (
            <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
              <label className="modal-field">
                {t("coDate")}
                <input type="date" required value={x.date} onChange={(e) => setInst(i, { date: e.target.value })} />
              </label>
              <label className="modal-field">
                {t("coAmount")}
                <input type="number" min={1} required value={x.amount || ""} onChange={(e) => setInst(i, { amount: Math.round(Number(e.target.value) || 0) })} />
              </label>
              <label className="modal-field">
                {t("coMode")}
                <select value={x.mode} onChange={(e) => setInst(i, { mode: e.target.value as PaymentMode })}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`coMode_${m}` as StringKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                {t("coRef")}
                <input value={x.ref} maxLength={120} onChange={(e) => setInst(i, { ref: e.target.value })} />
              </label>
              {f.instalments.length > 1 && (
                <button type="button" className="doc-btn" onClick={() => setF({ ...f, instalments: f.instalments.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" className="doc-btn" onClick={() => setF({ ...f, instalments: [...f.instalments, { date: today(), amount: 0, mode: "rtgs", ref: "" }] })}>
              {t("coAddInstalment")}
            </button>
            <span className={total === f.consideration ? "doc-sub" : "modal-error"} style={{ marginTop: 0 }}>
              {t("coInstTotal", { t: inr(total) })}
            </span>
          </div>
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="btn-calc modal-submit" disabled={a.createSale.isPending || a.updateSale.isPending}>
            {t("coSave")}
          </button>
        </form>
      </div>
    </div>
  );
}

function SetupTab({ project }: { project: ColonyProject }) {
  const { t } = useWaT();
  const a = useColonyActions(project.id);
  const [f, setF] = useState<ColonyProjectInput>(() => ({
    name: project.name,
    village: project.village,
    developer: project.developer,
    partners: project.partners,
    devPermissions: [project.devPermissions[0] ?? "", project.devPermissions[1] ?? ""],
    maintenanceClauses: [project.maintenanceClauses[0] ?? "", project.maintenanceClauses[1] ?? ""],
    guidelineRatePerSqm: project.guidelineRatePerSqm,
    template: project.template,
    templateDeedId: project.templateDeedId,
    companyNumbers: project.companyNumbers,
  }));
  const [numbers, setNumbers] = useState(project.companyNumbers.map((n) => n.slice(-10)).join(", "));
  const [deedRef, setDeedRef] = useState(project.templateDeedId ?? "");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  async function save() {
    setMsg(null);
    try {
      await a.save.mutateAsync({ ...f, companyNumbers: numbers.split(/[,\s]+/).filter(Boolean) });
      setMsg({ text: t("coSaved"), ok: true });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("coSaveError")), ok: false });
    }
  }
  async function suggest() {
    const id = deedRef.trim().split("/").filter(Boolean).pop() ?? "";
    setMsg(null);
    try {
      const s = await a.suggest.mutateAsync(id);
      setF({ ...f, template: s.template, templateDeedId: id });
      if (s.missing.length) setMsg({ text: t("coSuggestMissing", { m: s.missing.join(" ") }), ok: false });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("coSaveError")), ok: false });
    }
  }
  const pair = (k: "devPermissions" | "maintenanceClauses", label: StringKey, rows: number) =>
    [0, 1].map((i) => (
      <label key={`${k}${i}`} className="modal-field">
        {t(label, { n: i + 1 })}
        <textarea rows={rows} value={f[k][i] ?? ""} onChange={(e) => setF({ ...f, [k]: f[k].map((x, j) => (j === i ? e.target.value : x)) })} />
      </label>
    ));
  return (
    <div className="dr-form">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <label className="modal-field">
          {t("coSetupName")}
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="modal-field">
          {t("coVillage")}
          <input value={f.village} onChange={(e) => setF({ ...f, village: e.target.value })} />
        </label>
        <label className="modal-field">
          {t("coDeveloper")}
          <input value={f.developer} onChange={(e) => setF({ ...f, developer: e.target.value })} />
        </label>
        <label className="modal-field">
          {t("coGuidelineRate")}
          <input type="number" min={0} value={f.guidelineRatePerSqm ?? ""} onChange={(e) => setF({ ...f, guidelineRatePerSqm: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
      </div>
      <div style={{ fontWeight: 700, marginTop: 12 }}>{t("coPartners")}</div>
      {f.partners.map((p, i) => (
        <div key={p.key} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="modal-field" style={{ flex: "0 1 140px" }}>
            {t("coPartnerLabel")}
            <input value={p.label} onChange={(e) => setF({ ...f, partners: f.partners.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
          </label>
          <label className="modal-field" style={{ flex: "1 1 360px" }}>
            {t("coPartnerText")}
            <input value={p.text} onChange={(e) => setF({ ...f, partners: f.partners.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </label>
        </div>
      ))}
      {pair("devPermissions", "coDevPermission", 2)}
      {pair("maintenanceClauses", "coMaintenance", 3)}
      <label className="modal-field">
        {t("coCompanyNumbers")}
        <input value={numbers} onChange={(e) => setNumbers(e.target.value)} />
      </label>
      <div style={{ fontWeight: 700, marginTop: 12 }}>{t("coTemplate")}</div>
      <p className="doc-sub">{t("coTemplateHint")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="dr-action-select" style={{ flex: "1 1 280px" }} placeholder={t("coFromDeed")} value={deedRef} onChange={(e) => setDeedRef(e.target.value)} />
        <button type="button" className="doc-btn" disabled={!deedRef.trim() || a.suggest.isPending} onClick={suggest}>
          {t("coSuggest")}
        </button>
      </div>
      <textarea rows={18} style={{ width: "100%", marginTop: 8, fontFamily: "inherit" }} value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} />
      <button type="button" className="btn-calc" style={{ marginTop: 10 }} disabled={a.save.isPending} onClick={save}>
        {t("coSaveProject")}
      </button>
      {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
    </div>
  );
}
