import { useEffect, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DEEDS, findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { usePartnerDeeds, useUpdateDeed } from "./useDeedRegister";

/** Full-page deed-register editor — opened in a new tab from the deed table's Edit action. */
export function DeedRegisterEditPage() {
  const { id } = useParams({ from: "/my-deeds/edit/$id" });
  const { creatorId } = useSearch({ from: "/my-deeds/edit/$id" });
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);

  const records = usePartnerDeeds(creatorId);
  const update = useUpdateDeed();
  const item = records.data?.find((r) => r.id === id);

  const [type, setType] = useState<DeedType>("sale-deed");
  const [title, setTitle] = useState("");
  const [district, setDistrict] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (item) {
      setType(item.type);
      setTitle(item.title);
      setDistrict(item.district);
      setNotes(item.notes);
    }
  }, [item]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaved(false);
    update.mutate(
      { id, input: { type, title: title.trim(), district, notes } },
      { onSuccess: () => setSaved(true) },
    );
  }

  function onPrint() {
    const typeName = findDeed(type)?.name[lang] ?? type;
    const lines = [district, notes].filter(Boolean).join("\n\n");
    printDeed(title, `${typeName}\n\n${lines}`);
  }

  if (records.isLoading) {
    return (
      <section className="page">
        <div className="wrap">…</div>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="page">
        <div className="wrap">
          <p className="doc-empty">{t("drEmpty")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 780 }}>
        <h2 className="page-title">{t("deedsEditDeed")}</h2>

        <form className="modal-form" onSubmit={onSubmit} style={{ marginTop: 20 }}>
          <label className="modal-field">
            {t("drType")}
            <select value={type} onChange={(e) => setType(e.target.value as DeedType)}>
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="modal-field">
            {t("drDistrict")}
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              maxLength={80}
            />
          </label>
          <label className="modal-field">
            {t("drNotes")}
            <textarea
              rows={12}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </label>
          {update.isError && <p className="modal-error">{t("drSaveFailed")}</p>}
          {saved && <p className="dr-status-active">✓ {t("deedsSaved")}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-calc" type="submit" disabled={update.isPending}>
              {update.isPending ? "…" : t("deedsSave")}
            </button>
            <button type="button" className="modal-close" onClick={onPrint}>
              {t("deedsPrintDeed")}
            </button>
            <button type="button" className="modal-close" onClick={() => window.close()}>
              {t("deedsCloseTab")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
