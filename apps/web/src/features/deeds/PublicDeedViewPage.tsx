import { useRef } from "react";
import { useParams } from "@tanstack/react-router";
import { usePublicDeed } from "./useSampleDeeds";
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
    </div>
  );
}
