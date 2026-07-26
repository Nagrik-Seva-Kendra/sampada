import { useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { usePublicDeed, usePublicDeedCorrections, useCreateCorrection } from "./useSampleDeeds";
import { usePublishSelection } from "./useDeedLiveSelection";
import { printDeed } from "./printDeed";

/**
 * Party-facing read-only view, opened via the shareable "/d/:id" link. No
 * login required -- this is the page a buyer/seller lands on. Always shows
 * whatever staff most recently saved (same DeedTemplate row, no separate
 * "publish" step), so a correction is visible the moment the party reloads
 * the link.
 */
export function PublicDeedViewPage() {
  const { id } = useParams({ from: "/d/$id" });
  const deed = usePublicDeed(id);
  const contentRef = useRef<HTMLDivElement>(null);

  // Whenever the party highlights text in the deed body below, staff editing
  // this same deed see the highlight live -- see useDeedLiveSelection.ts.
  usePublishSelection(id, contentRef);

  if (deed.isLoading) {
    return (
      <div className="doc-viewer-shell">
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span className="spinner" aria-hidden />
        </div>
      </div>
    );
  }

  if (!deed.data) {
    return (
      <div className="doc-viewer-shell">
        <div className="doc-viewer-paper">
          <p style={{ textAlign: "center", color: "#6b6b6b", margin: 0 }}>This link is no longer valid.</p>
        </div>
      </div>
    );
  }

  const { title, content, updatedAt } = deed.data;

  return (
    <div className="doc-viewer-shell">
      <div className="doc-viewer-toolbar">
        <div>
          <div className="doc-viewer-title">{title}</div>
          <div className="doc-viewer-sub">Last updated {new Date(updatedAt).toLocaleString()}</div>
        </div>
        <button type="button" className="doc-viewer-btn" onClick={() => printDeed(title, content)}>
          Print
        </button>
      </div>
      <div className="doc-viewer-paper">
        <div ref={contentRef} className="doc-viewer-body">
          {content}
        </div>
      </div>
      <CorrectionPanel deedId={id} />
    </div>
  );
}

/**
 * Lets the party flag something wrong with the deed above, and shows the
 * status of anything already reported on this same link (staff resolving it
 * flips the badge below within ~20s, via polling -- see
 * usePublicDeedCorrections).
 */
function CorrectionPanel({ deedId }: { deedId: string }) {
  const corrections = usePublicDeedCorrections(deedId);
  const createCorrection = useCreateCorrection(deedId);
  const [message, setMessage] = useState("");

  function submit() {
    const trimmed = message.trim();
    if (!trimmed) return;
    createCorrection.mutate(
      { message: trimmed },
      { onSuccess: () => setMessage("") },
    );
  }

  return (
    <div className="doc-correction-panel">
      <div className="doc-correction-heading">Is draft mein koi correction chahiye?</div>
      <div className="doc-correction-hint">
        Neeche likhiye ki kya galat hai ya kya badalna hai — hamari team ko turant pata chal jaayega.
      </div>
      <textarea
        className="doc-correction-textarea"
        placeholder="Jaise: naam ki spelling galat hai, plot number sahi karein, etc."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={createCorrection.isPending}
      />
      <div className="doc-correction-actions">
        <button
          type="button"
          className="doc-viewer-btn"
          onClick={submit}
          disabled={createCorrection.isPending || !message.trim()}
        >
          {createCorrection.isPending ? "Submitting…" : "Submit correction"}
        </button>
      </div>

      {corrections.data && corrections.data.length > 0 && (
        <div className="doc-correction-list">
          {corrections.data.map((c) => (
            <div key={c.id} className="doc-correction-item">
              <div className="doc-correction-item-head">
                <span
                  className={`doc-correction-badge ${c.status === "RESOLVED" ? "resolved" : "pending"}`}
                >
                  {c.status === "RESOLVED" ? "✓ Correction laga diya gaya" : "Pending"}
                </span>
                <span style={{ fontSize: 11, color: "#9a9a9a" }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="doc-correction-msg">{c.message}</div>
              {c.status === "RESOLVED" && c.resolutionNote && (
                <div className="doc-correction-resolution">{c.resolutionNote}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
