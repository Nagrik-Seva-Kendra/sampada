import { useParams } from "@tanstack/react-router";
import { usePublicDeed } from "./useSampleDeeds";
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

  if (deed.isLoading) {
    return (
      <section className="page">
        <div className="wrap" style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span className="spinner" aria-hidden />
        </div>
      </section>
    );
  }

  if (!deed.data) {
    return (
      <section className="page">
        <div className="wrap">
          <p className="doc-empty">This link is no longer valid.</p>
        </div>
      </section>
    );
  }

  const { title, content, updatedAt } = deed.data;

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h2 className="page-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="doc-btn" onClick={() => printDeed(title, content)}>
            Print
          </button>
        </div>
        <p className="doc-sub" style={{ fontSize: 12, opacity: 0.7 }}>
          Last updated {new Date(updatedAt).toLocaleString()}
        </p>
        <div
          style={{
            fontSize: "1.05rem",
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
            textAlign: "justify",
            marginTop: 20,
          }}
        >
          {content}
        </div>
      </div>
    </section>
  );
}
