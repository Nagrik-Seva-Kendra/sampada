import { useState } from "react";
import type { CreateDeedInput, CreatePartnerInput, DeedRecordItem, DeedType, PartnerItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DEEDS, findDeed } from "./deedData";
import {
  useCreateDeed,
  useCreatePartner,
  useDeleteDeed,
  useMyDeeds,
  usePartnerDeeds,
  usePartners,
} from "./useDeedRegister";

const EMPTY_DEED: CreateDeedInput = { type: "sale-deed", title: "", district: "", notes: "" };
const EMPTY_PARTNER: CreatePartnerInput = { fname: "", lname: "", email: "", password: "" };

export function DeedRegisterPage() {
  const lang = useUiStore((s) => s.lang);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("drTitle")}
        </div>
        <h2 className="page-title">{t("drTitle")}</h2>

        <NewDeedForm />
        <MyDeeds />
        {isAdmin && <PartnersPanel />}
      </div>
    </section>
  );
}

function NewDeedForm() {
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
            rows={2}
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

function DeedList({
  deeds,
  showCreator,
  canDelete,
}: {
  deeds: DeedRecordItem[];
  showCreator: boolean;
  canDelete: boolean;
}) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const del = useDeleteDeed();

  if (deeds.length === 0) return <p className="doc-empty">{t("drEmpty")}</p>;

  return (
    <div className="doc-list" style={{ marginTop: 12 }}>
      {deeds.map((d) => (
        <div className="msg" key={d.id}>
          <div className="msg-head">
            <span className="msg-name">
              <span className="dr-type">{findDeed(d.type)?.name[lang] ?? d.type}</span> {d.title}
            </span>
            <span className="msg-date">{new Date(d.createdAt).toLocaleString()}</span>
          </div>
          <div className="msg-contacts">
            {showCreator && (
              <span>
                {t("drBy")} <strong>{d.createdByName}</strong>
              </span>
            )}
            {d.district && <span>{showCreator ? " · " : ""}{d.district}</span>}
          </div>
          {d.notes && <p className="msg-body">{d.notes}</p>}
          {canDelete && (
            <a className="dr-delete" onClick={() => del.mutate(d.id)}>
              {t("drDelete")}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function MyDeeds() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const deeds = useMyDeeds();

  return (
    <>
      <h3 className="er-section">{t("drMine")}</h3>
      {deeds.isError && <p className="modal-error">{t("drError")}</p>}
      {deeds.data && <DeedList deeds={deeds.data} showCreator={false} canDelete />}
    </>
  );
}

/** Admin: partner list with counts; click a partner to see their register. */
function PartnersPanel() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const partners = usePartners();
  const [selected, setSelected] = useState<PartnerItem | null>(null);
  const partnerDeeds = usePartnerDeeds(selected?.id ?? null);

  if (selected) {
    return (
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
    );
  }

  const list = partners.data ?? [];
  return (
    <>
      <h3 className="er-section">{t("drPartners")}</h3>
      {list.length === 0 && !partners.isLoading && (
        <p className="doc-empty">{t("drPartnersEmpty")}</p>
      )}
      <div className="dr-partners">
        {list.map((p) => (
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
