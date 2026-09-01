import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import type { DeedPeer } from "@sampada/shared";
import { useDeedCorrections, useResolveCorrection, useSampleDeed, useSaveSampleDeed } from "./useSampleDeeds";
import { useAutoSaveDeed } from "./useAutoSaveDeed";
import { peerColor, useDeedPresence } from "./useDeedPresence";
import { printDeed } from "./printDeed";
import { downloadDeedPdf } from "./deedPdf";
import { DeedHistoryModal } from "./DeedHistoryModal";
import { useLiveSelection } from "./useDeedLiveSelection";
import { DeedPropertyDetailSection } from "./DeedPropertyDetailSection";
import { AmountAudit, confirmAmountsBeforePrint } from "../../components/AmountAudit";

/**
 * Other people's cursors at one character offset, drawn inside the backdrop
 * that already mirrors the textarea and scrolls with it — so they follow the
 * real text without measuring a single coordinate. The anchor is zero-width:
 * a caret must never shift the mirrored text out of alignment with the
 * textarea on top of it.
 */
function PeerCarets({ peers }: { peers: DeedPeer[] }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  // A caret at the end of a line is the normal case while typing, and its
  // badge would run off the right edge into the backdrop's clip. Nothing in
  // CSS can see that coming, so measure once per position and hang the badge
  // off the other side when it wouldn't fit.
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const box = anchor?.offsetParent as HTMLElement | null;
    const label = anchor?.querySelector<HTMLElement>(".deed-peer-name");
    if (!anchor || !box || !label) return;
    setFlip(anchor.offsetLeft + label.offsetWidth + 12 > box.clientWidth);
  }, [peers]);

  return (
    <span className={"deed-peer-anchor" + (flip ? " flip" : "")} ref={anchorRef}>
      {peers.map((peer, i) => (
        <span
          key={peer.sessionId}
          className="deed-peer-caret"
          // Two people on the same character would sit exactly on top of each
          // other; nudge each subsequent one aside so both stay readable.
          style={{ backgroundColor: peerColor(peer.userId), left: i * 3 }}
        >
          <span className="deed-peer-name" style={{ backgroundColor: peerColor(peer.userId) }}>
            {peer.name}
          </span>
        </span>
      ))}
    </span>
  );
}

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
  const params = new URLSearchParams(window.location.search);
  const isNew = params.get("new") === "1";
  // Set by CreateDeedMenu when the server started this draft from the
  // workspace's own starter, so the body is a skeleton rather than something
  // the user wrote. Worth saying out loud on a legal document: the placeholders
  // are theirs to replace, and it is not a deed until they do.
  const fromSample = isNew && params.get("sample") === "1";

  const record = useSampleDeed(id);
  const saveDeed = useSaveSampleDeed(type);
  const item = record.data;
  const corrections = useDeedCorrections(id, !!item);
  const resolveCorrection = useResolveCorrection(id);
  const pendingCorrections = (corrections.data ?? []).filter((c) => c.status === "PENDING");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  // Emptying the box is also the way to dismiss the note about it.
  const [sampleCleared, setSampleCleared] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkCopyFailed, setLinkCopyFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [nakshaStarted, setNakshaStarted] = useState(false);

  // Live view of whatever text range the party is currently highlighting on
  // the public share-link page (/d/:id), pushed over SSE — lets staff see
  // what the party is looking at while both sides have the deed open.
  const remoteSelection = useLiveSelection(id);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Colleagues with this same deed open, and where each of them is typing.
  const peers = useDeedPresence(id, textareaRef);
  // One chip per person, not per tab: someone with the deed open twice is one
  // colleague to greet, even though both of their cursors are worth drawing.
  const peopleHere = peers.filter((p, i) => peers.findIndex((q) => q.userId === p.userId) === i);

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

  /**
   * The backdrop's contents: the deed text, cut at every offset that needs
   * something drawn on it — the party's highlight, and each colleague's
   * cursor. Cutting the highlight into more pieces is harmless, since every
   * piece is marked the same way.
   */
  function renderBackdrop() {
    const caretsAt = new Map<number, DeedPeer[]>();
    for (const peer of peers) {
      if (!peer.caret) continue;
      // A cursor can outlive the text it sat in (they deleted a paragraph
      // while we were mid-keystroke), so never index past the end.
      const at = Math.min(Math.max(peer.caret.start, 0), content.length);
      const existing = caretsAt.get(at);
      if (existing) existing.push(peer);
      else caretsAt.set(at, [peer]);
    }

    const cuts = new Set<number>([0, content.length, ...caretsAt.keys()]);
    if (remoteSelection) {
      cuts.add(Math.min(remoteSelection.start, content.length));
      cuts.add(Math.min(remoteSelection.end, content.length));
    }
    const points = [...cuts].sort((a, b) => a - b);

    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < points.length; i++) {
      const at = points[i];
      if (at === undefined) continue;
      const carets = caretsAt.get(at);
      if (carets) nodes.push(<PeerCarets key={`caret-${at}`} peers={carets} />);

      const next = points[i + 1];
      if (next === undefined) continue;
      const text = content.slice(at, next);
      const highlighted = !!remoteSelection && at >= remoteSelection.start && next <= remoteSelection.end;
      nodes.push(<Fragment key={`text-${at}`}>{highlighted ? renderHighlightedRange(text) : text}</Fragment>);
    }
    return nodes;
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
          {peopleHere.length > 0 && (
            <div className="deed-peer-chips">
              {peopleHere.map((peer) => (
                <span key={peer.userId} className="deed-peer-chip">
                  <span className="deed-peer-chip-dot" style={{ backgroundColor: peerColor(peer.userId) }} />
                  {peer.name}
                </span>
              ))}
            </div>
          )}
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
            {fromSample && !sampleCleared && (
              <div className="deed-sample-note">
                <span>{t("deedsSampleNote")}</span>
                <button
                  type="button"
                  className="deed-sample-clear"
                  onClick={() => {
                    setContent("");
                    setSampleCleared(true);
                    textareaRef.current?.focus();
                  }}
                >
                  {t("deedsSampleClear")}
                </button>
              </div>
            )}
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
                {renderBackdrop()}
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
          <AmountAudit
            content={content}
            onJumpTo={(start, end) => {
              const el = textareaRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(start, end);
            }}
          />
          {pdfFailed && <p className="modal-error">{t("deedsPdfFailed")}</p>}
          {linkCopyFailed && <p className="modal-error">{t("deedsLinkCopyFailed")}</p>}
          <div className="deed-edit-actions">
            <button className="btn-calc" type="submit" disabled={status === "saving"}>
              {status === "saving" ? "…" : t("deedsSave")}
            </button>
            <button type="button" className="doc-btn" onClick={() => {
                if (confirmAmountsBeforePrint(content)) printDeed(title, content);
              }}>
              {t("deedsPrintDeed")}
            </button>
            <button
              type="button"
              className="doc-btn"
              onClick={() => {
                if (confirmAmountsBeforePrint(content)) void onDownloadPdf();
              }}
              disabled={pdfBusy}
            >
              {pdfBusy ? "…" : t("deedsDownloadPdf")}
            </button>
            <button type="button" className="doc-btn" onClick={() => void onCopyShareLink()}>
              {linkCopied ? t("deedsLinkCopied") : t("deedsCopyLink")}
            </button>
            {type === "sale-deed" && (
              <button
                type="button"
                className="doc-btn"
                onClick={() => {
                  setNakshaStarted(true);
                  document.getElementById("naksha-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {t("propDetailGenerateBtn")}
              </button>
            )}
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

        {type === "sale-deed" && (
          <div id="naksha-section">
            <DeedPropertyDetailSection deedId={id} started={nakshaStarted} />
          </div>
        )}
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
