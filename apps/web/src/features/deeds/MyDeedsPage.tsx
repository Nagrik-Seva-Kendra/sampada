import { useState } from "react";
import type { CreateDeedInput, DeedType } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useCanDeleteDeeds } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DEEDS } from "./deedData";
import { DeedList } from "./DeedList";
import { useCreateDeed, useMyDeeds } from "./useDeedRegister";

const EMPTY_DEED: CreateDeedInput = { type: "sale-deed", title: "", district: "", notes: "" };

/** Own deed register: create deeds + list only the caller's deeds. */
export function MyDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const deeds = useMyDeeds();
  const canDelete = useCanDeleteDeeds();

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navMyDeeds")}
        </div>
        <h2 className="page-title">{t("navMyDeeds")}</h2>

        <NewDeedForm />

        <h3 className="er-section">{t("drMine")}</h3>
        {deeds.isError && <p className="modal-error">{t("drError")}</p>}
        {deeds.data && <DeedList deeds={deeds.data} showCreator={false} canDelete={canDelete} />}
      </div>
    </section>
  );
}

export function NewDeedForm() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const create = useCreateDeed();
  const [form, setForm] = useState<CreateDeedInput>(EMPTY_DEED);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(form, { onSuccess: () => setForm(EMPTY_DEED) });
  }

  return (
    <form className="dr-form" onSubmit={onSubmit}>
      <h3 className="er-section" style={{ marginTop: 0 }}>{t("drNew")}</h3>
      <div className="dr-form-grid">
        <label className="modal-field">
          {t("drType")}
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DeedType }))}
          >
            {DEEDS.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="modal-field">
          {t("drDeedTitle")}
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            maxLength={200}
          />
        </label>
        <label className="modal-field">
          {t("drDistrict")}
          <input
            value={form.district}
            onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
            maxLength={80}
          />
        </label>
        <label className="modal-field dr-notes">
          {t("drNotes")}
          <textarea
            rows={6}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            maxLength={2000}
          />
        </label>
      </div>
      {create.isError && <p className="modal-error">{t("drSaveFailed")}</p>}
      <button className="btn-calc" type="submit" disabled={create.isPending}>
        {create.isPending ? "…" : t("drCreate")}
      </button>
    </form>
  );
}
