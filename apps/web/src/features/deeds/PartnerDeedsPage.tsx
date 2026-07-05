import { useState } from "react";
import type { CreatePartnerInput, PartnerItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DeedList } from "./DeedList";
import { useCreatePartner, usePartnerDeeds, usePartners } from "./useDeedRegister";

const EMPTY_PARTNER: CreatePartnerInput = { fname: "", lname: "", email: "", password: "" };

/** Admin only: every partner's deeds, kept separate from the admin's own. */
export function PartnerDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const partners = usePartners();
  const [selected, setSelected] = useState<PartnerItem | null>(null);
  const partnerDeeds = usePartnerDeeds(selected?.id ?? null);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navPartnerDeeds")}
        </div>
        <h2 className="page-title">{t("navPartnerDeeds")}</h2>

        {selected ? (
          <>
            <h3 className="er-section">
              {t("drDeedsBy")} {selected.fname} {selected.lname}
            </h3>
            <a className="dr-back" onClick={() => setSelected(null)}>
              {t("drBackPartners")}
            </a>
            {partnerDeeds.isError && <p className="modal-error">{t("drError")}</p>}
            {partnerDeeds.data && (
              <DeedList deeds={partnerDeeds.data} showCreator canDelete={false} />
            )}
          </>
        ) : (
          <>
            <h3 className="er-section">{t("drPartners")}</h3>
            {(partners.data ?? []).length === 0 && !partners.isLoading && (
              <p className="doc-empty">{t("drPartnersEmpty")}</p>
            )}
            <div className="dr-partners">
              {(partners.data ?? []).map((p) => (
                <a key={p.id} className="dr-partner" onClick={() => setSelected(p)}>
                  <span className="dr-partner-name">
                    {p.fname} {p.lname}
                  </span>
                  <span className="dr-partner-email">{p.email}</span>
                  <span className="dr-partner-count">
                    {p.deedCount} {t("drDeedCount")}
                  </span>
                </a>
              ))}
            </div>
            <AddPartnerForm />
          </>
        )}
      </div>
    </section>
  );
}

function AddPartnerForm() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const create = useCreatePartner();
  const [form, setForm] = useState<CreatePartnerInput>(EMPTY_PARTNER);
  const set =
    (k: keyof CreatePartnerInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(form, { onSuccess: () => setForm(EMPTY_PARTNER) });
  }

  return (
    <form className="dr-form" onSubmit={onSubmit}>
      <h3 className="er-section" style={{ marginTop: 0 }}>{t("drAddPartner")}</h3>
      <div className="dr-form-grid">
        <label className="modal-field">
          {t("drFname")}
          <input value={form.fname} onChange={set("fname")} required maxLength={100} />
        </label>
        <label className="modal-field">
          {t("drLname")}
          <input value={form.lname} onChange={set("lname")} required maxLength={100} />
        </label>
        <label className="modal-field">
          {t("authEmail")}
          <input type="email" value={form.email} onChange={set("email")} required />
        </label>
        <label className="modal-field">
          {t("authPassword")}
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            required
            minLength={8}
          />
        </label>
      </div>
      {create.isSuccess && <p className="contact-ok">{t("drPartnerCreated")}</p>}
      {create.isError && <p className="modal-error">{t("drPartnerFailed")}</p>}
      <button className="btn-calc" type="submit" disabled={create.isPending}>
        {create.isPending ? "…" : t("drAddPartner")}
      </button>
    </form>
  );
}
