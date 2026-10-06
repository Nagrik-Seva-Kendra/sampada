import { useState } from "react";
import type { ColonyGuidelineRow, ColonyProjectInput, ColonySetupSuggestion, ColonySource } from "@sampada/shared";
import { apiErrorMessage } from "../../lib/api";
import { useWaT } from "../whatsapp/waI18n";
import { useColonyActions } from "./useColony";

function Sources({ from }: { from: ColonySource[] }) {
  const { t } = useWaT();
  if (!from.length) return null;
  return (
    <div className="doc-sub" style={{ fontSize: 12 }}>
      {t("coFrom")}:{" "}
      {from.map((s, i) => (
        <span key={s.deedId}>
          {i > 0 && ", "}
          <a href={`/deeds/sale-deed/edit/${s.deedId}`} target="_blank" rel="noreferrer">
            {s.title}
          </a>
        </span>
      ))}
    </div>
  );
}

/**
 * "Fill Setup from old deeds": reads the project's old sale deeds and shows each
 * suggested field with the deed(s) it came from; the owner applies what is right
 * (to the form) and then saves. Sold plots / units can be imported as SOLD.
 */
export function SetupFromDeeds({ projectId, f, setF }: { projectId: string; f: ColonyProjectInput; setF: (f: ColonyProjectInput) => void }) {
  const { t } = useWaT();
  const a = useColonyActions(projectId);
  const [extra, setExtra] = useState("");
  const [s, setS] = useState<ColonySetupSuggestion | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function read() {
    setMsg(null);
    try {
      setS(await a.setupSuggest.mutateAsync(extra));
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("coSaveError")), ok: false });
    }
  }

  const apply = (patch: Partial<ColonyProjectInput>) => setF({ ...f, ...patch });
  const all = (x: ColonySetupSuggestion): Partial<ColonyProjectInput> => ({
    ...(x.kind ? { kind: x.kind.value } : {}),
    ...(x.developer ? { developer: x.developer.value } : {}),
    ...(x.village ? { village: x.village.value } : {}),
    ...(x.ward ? { ward: x.ward.value } : {}),
    ...(x.surveyNos ? { surveyNos: x.surveyNos.value } : {}),
    ...(x.partners.length ? { partners: x.partners.slice(0, 6).map(({ from: _f, ...p }) => p) } : {}),
    ...(x.devPermissions.length ? { devPermissions: [x.devPermissions[0]?.value ?? "", x.devPermissions[1]?.value ?? ""] } : {}),
    ...(x.maintenanceClauses.length ? { maintenanceClauses: [x.maintenanceClauses[0]?.value ?? "", x.maintenanceClauses[1]?.value ?? ""] } : {}),
    ...(x.template ? { template: x.template.value, templateDeedId: x.template.from[0]?.deedId ?? null } : {}),
    ...(x.guideline[0] ? { guidelineSno: x.guideline[0].sno } : {}),
  });

  async function importSold() {
    if (!s?.plots.length) return;
    setMsg(null);
    try {
      const r = await a.importSold.mutateAsync({ plots: s.plots.map(({ from: _f, ...p }) => p) });
      setMsg({ text: t("coImported", { a: r.added, u: r.updated }), ok: true });
    } catch (err) {
      setMsg({ text: await apiErrorMessage(err, t("coSaveError")), ok: false });
    }
  }

  const row = (label: string, value: string | null | undefined, from: ColonySource[] | undefined, onApply: () => void) => (
    <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <b style={{ minWidth: 140 }}>{label}</b>
        <span style={{ flex: "1 1 300px", whiteSpace: "pre-wrap" }}>{value || <i className="doc-sub">{t("coNothing")}</i>}</span>
        {value && (
          <button type="button" className="doc-btn" onClick={onApply}>
            {t("coApply")}
          </button>
        )}
      </div>
      {from && <Sources from={from} />}
    </div>
  );

  return (
    <div className="dr-form" style={{ marginBottom: 14, background: "var(--surface-2, transparent)" }}>
      <div style={{ fontWeight: 800 }}>📚 {t("coFromDeeds")}</div>
      <p className="doc-sub">{t("coFromDeedsHint")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="dr-action-select" style={{ flex: "1 1 260px" }} placeholder={t("coFromDeedsExtra")} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <button type="button" className="btn-calc" disabled={a.setupSuggest.isPending} onClick={read}>
          {a.setupSuggest.isPending ? "…" : t("coFromDeeds")}
        </button>
      </div>
      {msg && <p className={msg.ok ? "doc-sub" : "modal-error"}>{msg.text}</p>}
      {s && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="doc-sub">{t("coFromDeedsRead", { n: s.deeds.length })}</span>
            {s.deeds.length > 0 && (
              <button type="button" className="btn-calc" onClick={() => apply(all(s))}>
                {t("coApplyAll")}
              </button>
            )}
          </div>
          {s.warnings.length > 0 && (
            <ul style={{ paddingLeft: 18 }}>
              {s.warnings.map((w, i) => (
                <li key={i} className="modal-error">
                  ⚠️ {w}
                </li>
              ))}
            </ul>
          )}
          {row(t("coKind"), s.kind ? t(s.kind.value === "SHOP" ? "coKindSHOP" : "coKindPLOT") : null, s.kind?.from, () => s.kind && apply({ kind: s.kind.value }))}
          {row(t("coDeveloper"), s.developer?.value, s.developer?.from, () => s.developer && apply({ developer: s.developer.value }))}
          {row(t("coVillage"), s.village?.value, s.village?.from, () => s.village && apply({ village: s.village.value }))}
          {row(t("coWard"), s.ward?.value, s.ward?.from, () => s.ward && apply({ ward: s.ward.value }))}
          {row(t("coSurvey"), s.surveyNos?.value, s.surveyNos?.from, () => s.surveyNos && apply({ surveyNos: s.surveyNos.value }))}
          <div style={{ fontWeight: 700, marginTop: 8 }}>{t("coPartnerVariants")}</div>
          {s.partners.map((p) => row(p.label, p.text, p.from, () => apply({ partners: [...f.partners.filter((x) => x.key !== p.key), { key: p.key, label: p.label, text: p.text }].slice(0, 6) })))}
          {s.devPermissions.map((d, i) => row(`${t("coDevPermission", { n: i + 1 })}`, d.value, d.from, () => apply({ devPermissions: f.devPermissions.map((x, j) => (j === i ? d.value : x)) })))}
          {s.maintenanceChoices.map((c, i) => (
            <p key={`mc${i}`} className="doc-sub" style={{ margin: "6px 0 0", fontWeight: 700 }}>
              ✅ {t("coMaintChosen", { chosen: c.chosenStart ?? "—", dropped: c.droppedStarts.join(" / ") })}
            </p>
          ))}
          {s.maintenanceClauses.map((d, i) => row(`${t("coMaintenance", { n: i + 1 })}`, d.value, d.from, () => apply({ maintenanceClauses: f.maintenanceClauses.map((x, j) => (j === i ? d.value : x)) })))}
          {s.guideline.map((g: ColonyGuidelineRow) =>
            row(`${t("coGuidelineRow")} #${g.sno}`, `${g.hi} (वार्ड ${g.ward}) — ₹${g.plotRes}/वर्गमीटर${g.multiCom ? `, व्यावसायिक बहुमंजिला ₹${g.multiCom}` : ""}`, undefined, () => apply({ guidelineSno: g.sno })),
          )}
          {s.template &&
            row(
              `${t("coTemplate")}${s.template.missing.length ? ` (⚠️ ${s.template.missing.join(" ")})` : ""}`,
              s.template.value.slice(0, 1200) + (s.template.value.length > 1200 ? "…" : ""),
              s.template.from,
              () => s.template && apply({ template: s.template.value, templateDeedId: s.template.from[0]?.deedId ?? null }),
            )}
          <div style={{ fontWeight: 700, marginTop: 8 }}>
            {t("coSoldPlots")} ({s.plots.length})
          </div>
          {s.plots.length > 0 && (
            <>
              <div style={{ maxHeight: 240, overflow: "auto", fontSize: 13 }}>
                {s.plots.map((p) => (
                  <div key={`${p.block}|${p.plotNo}`} style={{ borderTop: "1px solid var(--border)", padding: "3px 0" }}>
                    {p.block ? `${p.block}-` : ""}
                    {p.plotNo}
                    {p.floor ? ` · ${p.floor}` : ""} · {p.areaSqft ?? "—"} वर्गफुट{p.corner ? ` · ${t("coCorner")}` : ""} · <span className="doc-sub">{p.from.title}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="doc-btn" style={{ marginTop: 6 }} disabled={a.importSold.isPending} onClick={importSold}>
                {t("coImportSold", { n: s.plots.length })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
