import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DeedList } from "./DeedList";
import { useAllPartnerDeeds, usePartnerDeeds, usePartners } from "./useDeedRegister";

/** Employee view: every partner's deeds (admin's/employees' own excluded). Edit/print, never create or delete. */
export function EmployeeDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const partners = usePartners();
  const [selectedId, setSelectedId] = useState("");
  const selected = (partners.data ?? []).find((p) => p.id === selectedId);
  const onePartner = usePartnerDeeds(selectedId || null);
  const allPartners = useAllPartnerDeeds(!selectedId);
  const deeds = selectedId ? onePartner : allPartners;

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
                  {p.fname} {p.lname} ({p.deedCount} {t("drDeedCount")})
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
        {deeds.data && <DeedList deeds={deeds.data} showCreator canDelete={false} canEdit />}
      </div>
    </section>
  );
}
