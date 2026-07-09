import { useMemo, useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PartnerSampleDeedList } from "./PartnerSampleDeedList";
import { useAllPartnerSampleDeeds } from "./useSampleDeeds";
import { usePartners } from "../partner/usePartners";

/** Employee view: every partner's sample deeds across every category. View/print, never create or delete. */
export function EmployeeDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const partners = usePartners();
  const [selectedId, setSelectedId] = useState("");
  const selected = (partners.data ?? []).find((p) => p.id === selectedId);
  const allDeeds = useAllPartnerSampleDeeds(null);
  const deedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDeeds.data ?? []) counts[d.createdById] = (counts[d.createdById] ?? 0) + 1;
    return counts;
  }, [allDeeds.data]);
  const deeds = {
    ...allDeeds,
    data: selectedId ? allDeeds.data?.filter((d) => d.createdById === selectedId) : allDeeds.data,
  };

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navAllDeeds")}
        </div>
        <h2 className="page-title">{t("navAllDeeds")}</h2>

        {(partners.data ?? []).length === 0 && !partners.isLoading ? (
          <p className="doc-empty">{t("drPartnersEmpty")}</p>
        ) : (
          <label className="modal-field" style={{ maxWidth: 360 }}>
            {t("drPartners")}
            <select
              className="district-input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">{t("drAllPartners")}</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fname} {p.lname} ({deedCounts[p.id] ?? 0} {t("drDeedCount")})
                </option>
              ))}
            </select>
          </label>
        )}

        {selected && (
          <>
            <div className="dr-profile-card">
              <div>
                <strong>{selected.fname} {selected.lname}</strong>
                <span>{selected.email}</span>
              </div>
              <span>{t("profileMemberSince")}: {new Date(selected.createdAt).toLocaleDateString()}</span>
            </div>
            <h3 className="er-section">
              {t("drDeedsBy")} {selected.fname} {selected.lname}
            </h3>
          </>
        )}
        {deeds.isError && <p className="modal-error">{t("drError")}</p>}
        {deeds.data && <PartnerSampleDeedList deeds={deeds.data} />}
      </div>
    </section>
  );
}
