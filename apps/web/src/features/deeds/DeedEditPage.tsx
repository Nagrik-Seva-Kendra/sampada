import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { useSampleDeed, useSaveSampleDeed } from "./useSampleDeeds";
import { useAutoSaveDeed } from "./useAutoSaveDeed";
import { printDeed } from "./printDeed";
import { downloadDeedPdf } from "./deedPdf";

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
  const saveDeed = useSaveSampleDeed(type);
  const item = record.data;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  const draft = useMemo(() => ({ title, content }), [title, content]);

  // A deed can be auto-saved before it's been named — the create flow already
  // wrote the untitled placeholder as its title, so keep that rather than let
  // an empty box blank out the name shown in the deeds table.
  const untitled = t("deedsUntitledTitle");
  const auto = useAutoSaveDeed({
    draft,
    enabled: !!item,
    save: (d) =>
      saveDeed.mutateAsync({
        id,
        input: { title: d.title.trim() || untitled, content: d.content },
      }),
  });
  const { baseline, saveNow, status } = auto;

  // Seed the form from the server's copy exactly once per deed. Re-seeding on
  // every `item` identity would fight the author: each auto-save refreshes the
  // deed's cache entry, and reseeding from it would overwrite whatever they
  // typed while the request was in flight.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!item || seededRef.current === item.id) return;
    seededRef.current = item.id;
    const seeded = { title: isNew ? "" : item.title, content: item.content };
    setTitle(seeded.title);
    setContent(seeded.content);
    baseline(seeded);
  }, [item, isNew, baseline]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Auto-save will happily persist a half-written draft; an explicit Save
    // still means "this deed is complete", so it holds the line on both fields.
    if (!title.trim() || !content.trim()) return;
    void saveNow();
  }

  async function onDownloadPdf() {
    setPdfBusy(true);
    setPdfFailed(false);
    try {
      await downloadDeedPdf(title.trim() || untitled, content);
    } catch {
      setPdfFailed(true);
    } finally {
      setPdfBusy(false);
    }
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
      <div className="wrap" style={{ maxWidth: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="page-title" style={{ margin: 0 }}>
            {isNew ? t("deedsNewDeedTitle") : t("deedsEditDeed")}
          </h2>
          <span className="deed-type-tag">{deed ? deed.name[lang] : type}</span>
          <AutoSaveStatusLine status={status} t={t} />
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
              rows={34}
              style={{ fontSize: "1.05rem", lineHeight: 1.8, minHeight: "65vh", textAlign: "justify" }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              maxLength={40000}
            />
          </label>
          {pdfFailed && <p className="modal-error">{t("deedsPdfFailed")}</p>}
          <div className="deed-edit-actions">
            <button className="btn-calc" type="submit" disabled={status === "saving"}>
              {status === "saving" ? "…" : t("deedsSave")}
            </button>
            <button type="button" className="doc-btn" onClick={() => printDeed(title, content)}>
              {t("deedsPrintDeed")}
            </button>
            <button
              type="button"
              className="doc-btn"
              onClick={() => void onDownloadPdf()}
              disabled={pdfBusy}
            >
              {pdfBusy ? "…" : t("deedsDownloadPdf")}
            </button>
            <button type="button" className="doc-btn" onClick={() => window.close()}>
              {t("deedsCloseTab")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

/** "Saving… / Saved ✓ / Not saved — retrying", beside the editor's heading. */
function AutoSaveStatusLine({
  status,
  t,
}: {
  status: "idle" | "saving" | "saved" | "retrying";
  t: (k: StringKey) => string;
}) {
  if (status === "idle") return null;
  const style = { fontSize: 13, margin: 0 } as const;
  if (status === "saving") {
    return (
      <span className="doc-sub" style={{ ...style, opacity: 0.7 }} aria-live="polite">
        {t("deedsAutoSaving")}
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="dr-status-active" style={style} aria-live="polite">
        {t("deedsAutoSaved")}
      </span>
    );
  }
  return (
    <span className="modal-error" style={style} role="status" aria-live="polite">
      {t("deedsAutoSaveRetrying")}
    </span>
  );
}
