import { useEffect, useState } from "react";
import type { WaOfficeFees } from "@sampada/shared";
import { apiErrorMessage } from "../../lib/api";
import { useSaveWaFees, useUnblockWa, useWaBlocked, useWaFees } from "./useWhatsappRequests";
import { useWaT } from "./waI18n";
import { formatDate } from "./waLabels";

const num = (v: string) => (v.trim() === "" ? NaN : Math.round(Number(v)));

/** OWNER/ADMIN: the office fee table the bot quotes for "रजिस्ट्री खर्च जानना". */
export function FeesPanel() {
  const { t } = useWaT();
  const fees = useWaFees(true);
  const save = useSaveWaFees();
  const [draft, setDraft] = useState<WaOfficeFees | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (fees.data && !draft) setDraft(fees.data);
  }, [fees.data, draft]);
  if (!draft) return null;
  const setSlab = (i: number, k: "upTo" | "fee", v: string) =>
    setDraft({ ...draft, registrySlabs: draft.registrySlabs.map((s, j) => (j === i ? { ...s, [k]: num(v) } : s)) });
  async function onSave() {
    setMsg(null);
    try {
      setDraft(await save.mutateAsync(draft!));
      setMsg(t("waFeesSaved"));
    } catch (err) {
      setMsg(await apiErrorMessage(err, t("waFeesSaveError")));
    }
  }
  const field = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 } as const;
  return (
    <details style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{t("waFeesTitle")}</summary>
      <div style={{ padding: "8px 0", display: "grid", gap: 10, maxWidth: 560 }}>
        <p className="doc-sub">{t("waFeesNote")}</p>
        {draft.registrySlabs.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={field}>
              {t("waFeesUpTo")}
              <input type="number" min={1} value={Number.isNaN(s.upTo) ? "" : s.upTo} onChange={(e) => setSlab(i, "upTo", e.target.value)} />
            </label>
            <label style={field}>
              {t("waFeesFee")}
              <input type="number" min={0} value={Number.isNaN(s.fee) ? "" : s.fee} onChange={(e) => setSlab(i, "fee", e.target.value)} />
            </label>
            {draft.registrySlabs.length > 1 && (
              <button type="button" className="doc-btn" onClick={() => setDraft({ ...draft, registrySlabs: draft.registrySlabs.filter((_, j) => j !== i) })}>
                {t("waFeesRemove")}
              </button>
            )}
          </div>
        ))}
        <div>
          <button
            type="button"
            className="doc-btn"
            onClick={() => setDraft({ ...draft, registrySlabs: [...draft.registrySlabs, { upTo: (draft.registrySlabs.at(-1)?.upTo ?? 0) + 2_500_000, fee: 0 }] })}
          >
            {t("waFeesAddSlab")}
          </button>
        </div>
        <label style={field}>
          {t("waFeesAbove")}
          <input
            type="number"
            min={0}
            value={draft.registryAbove ?? ""}
            onChange={(e) => setDraft({ ...draft, registryAbove: e.target.value.trim() === "" ? null : num(e.target.value) })}
          />
        </label>
        <label style={field}>
          {t("waFeesGda")}
          <input type="number" min={0} value={Number.isNaN(draft.gdaPatta) ? "" : draft.gdaPatta} onChange={(e) => setDraft({ ...draft, gdaPatta: num(e.target.value) })} />
        </label>
        <label style={field}>
          {t("waFeesOther")}
          <input type="number" min={0} value={Number.isNaN(draft.otherDocs) ? "" : draft.otherDocs} onChange={(e) => setDraft({ ...draft, otherDocs: num(e.target.value) })} />
        </label>
        <div>
          <button type="button" className="btn-calc" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? t("waSaving") : t("waSave")}
          </button>
        </div>
        {msg && <p className="doc-sub">{msg}</p>}
      </div>
    </details>
  );
}

/** OWNER/ADMIN: numbers blocked for spam/abuse, with "unblock". */
export function BlockedPanel() {
  const { t, lang } = useWaT();
  const blocked = useWaBlocked(true);
  const unblock = useUnblockWa();
  const rows = blocked.data ?? [];
  return (
    <details style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        {t("waBlockedTitle")} {rows.length > 0 && <span className="status-pill bad">{rows.length}</span>}
      </summary>
      <div style={{ padding: "8px 0" }}>
        {rows.length === 0 && <p className="doc-sub">{t("waBlockedNone")}</p>}
        {rows.map((r) => (
          <div key={r.phone} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>+{r.phone}</span>
            <span className="status-pill warn">{r.reason === "abuse" ? t("waBlockedAbuse") : t("waBlockedSpam")}</span>
            <span className="doc-sub" style={{ marginTop: 0 }}>{formatDate(r.blockedAt, lang)}</span>
            <button type="button" className="doc-btn" disabled={unblock.isPending} onClick={() => unblock.mutate(r.phone)}>
              {t("waUnblock")}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
