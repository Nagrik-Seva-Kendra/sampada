import { useUiStore } from "../../stores/uiStore";
import { guidelineFileUrl, useGuidelineList } from "./useGuideline";
import { Download, FileText } from "lucide-react";

export function GuidelinePage() {
  const lang = useUiStore((s) => s.lang);
  const T = (en: string, hi: string) => (lang === "hi" ? hi : en);
  const { data, isLoading, isError } = useGuidelineList();
  const docs = data ?? [];

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {T("Guideline", "गाइडलाइन")}
        </div>
        <h2 className="page-title">{T("Guideline Documents", "गाइडलाइन दस्तावेज़")}</h2>
        <p className="er-sub">
          {T(
            "Official circulars, notices and guideline-rate documents uploaded by our office — view or download any of them below.",
            "हमारे कार्यालय द्वारा अपलोड किए गए सरकारी परिपत्र, सूचनाएं और गाइडलाइन दरों के दस्तावेज़ — नीचे देखें या डाउनलोड करें।",
          )}
        </p>

        {isLoading && <p>{T("Loading…", "लोड हो रहा है…")}</p>}
        {isError && <p className="modal-error">{T("Could not load documents.", "दस्तावेज़ लोड नहीं हो सके।")}</p>}
        {!isLoading && !isError && docs.length === 0 && (
          <p style={{ opacity: 0.6 }}>{T("No documents uploaded yet.", "अभी कोई दस्तावेज़ अपलोड नहीं हुआ।")}</p>
        )}

        {docs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {docs.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  border: "1px solid var(--border, #333)",
                  borderRadius: 8,
                  background: "var(--surface, rgba(255,255,255,0.02))",
                }}
              >
                <FileText size={20} style={{ opacity: 0.7, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {new Date(d.createdAt).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN")}
                    {d.uploadedByName ? " · " + d.uploadedByName : ""}
                  </div>
                </div>
                <a
                  className="btn-calc"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                  href={guidelineFileUrl(d.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Download size={15} /> {T("Download", "डाउनलोड करें")}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
