import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { useSampleDeeds, useUpdateSampleDeed } from "./useSampleDeeds";
import { printDeed } from "./printDeed";

/** Full-page deed editor — opened in a new tab from the deed table's Edit action. */
export function DeedEditPage() {
  const { slug, id } = useParams({ from: "/deeds/$slug/edit/$id" });
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const type = slug as DeedType;
  const deed = findDeed(slug);

  const records = useSampleDeeds(type);
  const update = useUpdateSampleDeed(type);
  const item = records.data?.find((r) => r.id === id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setContent(item.content);
    }
  }, [item]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaved(false);
    update.mutate(
      { id, input: { title: title.trim(), content: content.trim() } },
      { onSuccess: () => setSaved(true) },
    );
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
        <h2 className="page-title">
          {t("deedsEditDeed")}
          {deed ? ` — ${deed.name[lang]}` : ""}
        </h2>

        <form className="modal-form" onSubmit={onSubmit} style={{ marginTop: 20 }}>
          <label className="modal-field">
            {t("deedsColName")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
