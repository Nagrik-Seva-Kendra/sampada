import { useState } from "react";
import type { ContactInput } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useContact } from "./useContact";

export function ContactPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const contact = useContact();

  const [form, setForm] = useState<ContactInput>({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const set = (k: keyof ContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    contact.mutate(form, {
      onSuccess: () => setForm({ name: "", email: "", phone: "", message: "" }),
    });
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("footContact")}
        </div>
        <h2 className="page-title">{t("contactTitle")}</h2>
        <p className="er-sub">{t("contactIntro")}</p>

        <div className="contact-grid">
          <form className="contact-form" onSubmit={onSubmit}>
            <label className="modal-field">
              {t("contactName")}
              <input value={form.name} onChange={set("name")} required />
            </label>
            <label className="modal-field">
              {t("contactEmail")}
              <input type="email" value={form.email} onChange={set("email")} required />
            </label>
            <label className="modal-field">
              {t("contactPhone")}
              <input value={form.phone} onChange={set("phone")} />
            </label>
            <label className="modal-field">
              {t("contactMessage")}
              <textarea rows={5} value={form.message} onChange={set("message")} required />
            </label>
            {contact.isSuccess && <p className="contact-ok">{t("contactSent")}</p>}
            {contact.isError && <p className="modal-error">{t("contactError")}</p>}
            <button className="btn-calc" type="submit" disabled={contact.isPending}>
              {contact.isPending ? "…" : t("contactSend")}
            </button>
          </form>

          <aside className="contact-info">
            <h3 className="er-section" style={{ marginTop: 0 }}>
              {t("contactReach")}
            </h3>
            <p>📞 {t("phone")}</p>
            <p>✉️ {t("email")}</p>
            <p>📍 {t("contactAddress")}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
