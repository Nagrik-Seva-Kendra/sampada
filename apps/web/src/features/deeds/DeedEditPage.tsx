import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { useDeedCorrections, useResolveCorrection, useSampleDeed, useSaveSampleDeed } from "./useSampleDeeds";
import { useAutoSaveDeed } from "./useAutoSaveDeed";
import { printDeed } from "./printDeed";
import { downloadDeedPdf } from "./deedPdf";
import { DeedHistoryModal } from "./DeedHistoryModal";
import { useLiveSelection } from "./useDeedLiveSelection";
import { DeedPropertyDetailSection } from "./DeedPropertyDetailSection";

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
  const corrections = useDeedCorrections(id, !!item);
  const resolveCorrection = useResolveCorrection(id);
  const pendingCorrections = (corrections.data ?? []).filter((c) => c.status === "PENDING");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkCopyFailed, setLinkCopyFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Live view of whatever text range the party is currently highlighting on
  // the public share-link page (/d/:id), pushed over SSE — lets staff see
  // what the party is looking at while both sides have the deed open.
  const remoteSelection = useLiveSelection(id);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

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

  async function onCopyShareLink() {
    setLinkCopyFailed(false);
    const url = `${window.location.origin}/d/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setLinkCopyFailed(true);
    }
  }

  // Keep the invisible highlight backdrop scrolled to the same position as
  // the textarea on top of it, so the <mark> lines up with the real text.
  function onTextareaScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  // Renders a highlighted slice of content as one <mark> per line: a single
  // <mark> whose text contains a line break makes browsers stretch that
  // line's highlight background all the way to the container's edge, well
  // past the actual (often short, manually wrapped) line of deed text --
  // splitting on "\n" keeps each highlight sized to just its own line.
  function renderHighlightedRange(text: string) {
    const lines = text.split("\n");
    return lines.map((line, i) => (
      <Fragment key={i}>
        {i > 0 && "\n"}
        {line && <mark style={{ backgroundColor: "rgba(255, 196, 0, 0.35)", color: "transparent" }}>{line}</mark>}
      </Fragment>
    ));
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

        {pendingCorrections.length > 0 && (
          <div className="deed-corrections-banner">
            {pendingCorrections.map((c) => (
              <div key={c.id} className="deed-correction-row">
                <div>
                  <div className="deed-correction-row-label">
                    {lang === "hi" ? "Party ne correction bataya hai" : "Party flagged a correction"}
                  </div>
                  <div className="deed-correction-row-msg">{c.message}</div>
                </div>
                <button
                  type="button"
                  className="doc-btn"
                  style={{ flexShrink: 0 }}
                  disabled={resolveCorrection.isPending}
                  onClick={() => resolveCorrection.mutate({ correctionId: c.id, input: {} })}
                >
                  {lang === "hi" ? "Resolved mark karein" : "Mark resolved"}
                </button>
              </div>
            ))}
          </div>
        )}

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
            <div style={{ position: "relative", width: "100%" }}>
              <div
                ref={backdropRef}
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid transparent",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "1.05rem",
                  lineHeight: 1.8,
                  textAlign: "justify",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                  color: "transparent",
                  pointerEvents: "none",
                  minHeight: "65vh",
                }}
              >
                {remoteSelection ? (
                  <>
                    {content.slice(0, remoteSelection.start)}
                    {renderHighlightedRange(content.slice(remoteSelection.start, remoteSelection.end))}
                    {content.slice(remoteSelection.end)}
                  </>
                ) : (
                  content
                )}
              </div>
              <textarea
                ref={textareaRef}
                rows={34}
                style={{
                  fontSize: "1.05rem",
                  lineHeight: 1.8,
                  minHeight: "65vh",
                  textAlign: "justify",
                  position: "relative",
                  background: "transparent",
                  width: "100%",
                  boxSizing: "border-box",
                  display: "block",
                }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onScroll={onTextareaScroll}
                required
                maxLength={40000}
              />
            </div>
          </label>
          {pdfFailed && <p className="modal-error">{t("deedsPdfFailed")}</p>}
          {linkCopyFailed && <p className="modal-error">{t("deedsLinkCopyFailed")}</p>}
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
            <button type="button" className="doc-btn" onClick={() => void onCopyShareLink()}>
              {linkCopied ? t("deedsLinkCopied") : t("deedsCopyLink")}
            </button>
            <button type="button" className="doc-btn" onClick={() => setShowHistory(true)}>
              {t("deedsHistoryBtn")}
            </button>
            <button
              type="button"
              className="doc-btn"
              onClick={() => {
                // Flush any not-yet-saved edit before the tab disappears: the 2s
                // debounce (and window.close() racing past it) is exactly how a
                // just-typed deed can be lost — closing here always saves first.
                void saveNow().finally(() => window.close());
              }}
            >
              {t("deedsCloseTab")}
            </button>
          </div>
        </form>

        <DeedPropertyDetailSection deedId={id} />
      </div>

      {showHistory && <DeedHistoryModal deedId={id} onClose={() => setShowHistory(false)} />}
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
