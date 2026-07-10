import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { useSampleDeed, useUpdateSampleDeed } from "./useSampleDeeds";
import { printDeed } from "./printDeed";

/** Full-page deed editor — opened in a new tab from the deed table's Edit action. */
export function DeedEditPage() {
  const { slug, id } = useParams({ from: "/deeds/$slug/edit/$id" });
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const type = slug as DeedType;
  const deed = findDeed(slug);

  // Opened with ?new=1 straight after creating a blank/duplicated draft — start
  // with an empty title (placeholder prompts the user to name it) but keep any
  // seeded content (empty for a fresh deed, the source body for a duplicate).
  const isNew = new URLSearchParams(window.location.search).get("new") === "1";

  const record = useSampleDeed(id);
  const update = useUpdateSampleDeed(type);
  const item = record.data;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(isNew ? "" : item.title);
      setContent(item.content);
    }
  }, [item, isNew]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaved(false);
    update.mutate(
      { id, input: { title: title.trim(), content: content.trim() } },
      { onSuccess: () => setSaved(true) },
    );
  }

  if (record.isLoading) {
    return (
      <section className="page">
        <div className="wrap" style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span className="spinner" aria-hidden />
        </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="page-title" style={{ margin: 0 }}>
            {isNew ? t("deedsNewDeedTitle") : t("deedsEditDeed")}
          </h2>
          <span className="deed-type-tag">{deed ? deed.name[lang] : type}</span>
        </div>

        <form className="modal-form" onSubmit={onSubmit} style={{ marginTop: 20 }}>
          <label className="modal-field">
            {t("deedsColName")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("deedsTitlePlaceholder")}
              autoFocus={isNew}
              required
              maxLength={200}
            />
          </label>
          <label className="modal-field">
            {t("deedsContentLabel")}
            <textarea
              rows={22}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </label>
          {update.isError && <p className="modal-error">{t("drSaveFailed")}</p>}
          {saved && <p className="dr-status-active">✓ {t("deedsSaved")}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-calc" type="submit" disabled={update.isPending}>
              {update.isPending ? "…" : t("deedsSave")}
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={() => printDeed(title, content)}
            >
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
