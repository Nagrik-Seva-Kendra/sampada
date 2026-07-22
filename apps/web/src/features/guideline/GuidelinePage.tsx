import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import {
  MP_DISTRICTS,
  formatSession,
  guidelineSessions,
  useGuidelineFileOpener,
  useGuidelineList,
} from "./useGuideline";
import { Download, Eye, FileText } from "lucide-react";

const SESSIONS = guidelineSessions();

export function GuidelinePage() {
  const lang = useUiStore((s) => s.lang);
  const T = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [district, setDistrict] = useState("");
  const [session, setSession] = useState("");
  const { data, isLoading, isError } = useGuidelineList({
    district: district || undefined,
    session: session ? Number(session) : undefined,
  });
  const docs = data ?? [];
  const openFile = useGuidelineFileOpener();

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
            "Official circulars, notices and district-wise guideline-rate documents, session-wise from 2015-2016 onward — view or download any of them below.",
            "जिला-वार सरकारी परिपत्र, सूचनाएं और गाइडलाइन दरों के दस्तावेज़, 2015-2016 से सत्र-वार — नीचे देखें या डाउनलोड करें।",
          )}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "16px 0" }}>
          <select
            className="district-input"
            style={{ flex: "1 1 180px" }}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">{T("All districts", "सभी जिले")}</option>
            {MP_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            className="district-input"
            style={{ flex: "1 1 150px" }}
            value={session}
            onChange={(e) => setSession(e.target.value)}
          >
            <option value="">{T("All sessions", "सभी सत्र")}</option>
            {SESSIONS.map((y) => (
              <option key={y} value={y}>
                {formatSession(y)}
              </option>
            ))}
          </select>
        </div>

        {isLoading && <p>{T("Loading…", "लोड हो रहा है…")}</p>}
        {isError && <p className="modal-error">{T("Could not load documents.", "दस्तावेज़ लोड नहीं हो सके।")}</p>}
        {!isLoading && !isError && docs.length === 0 && (
          <p style={{ opacity: 0.6 }}>{T("No documents uploaded yet.", "अभी कोई दस्तावेज़ अपलोड नहीं हुआ।")}</p>
        )}

        {docs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
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
                  <div style={{ fontWeight: 600 }}>
                    <span className="doc-district">{d.district}</span> {d.title}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {formatSession(d.session)} ·{" "}
                    {new Date(d.createdAt).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN")}
                    {d.uploadedByName ? " · " + d.uploadedByName : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="doc-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                  onClick={() => openFile(d.id).then((url) => window.open(url, "_blank"))}
                >
                  <Eye size={15} /> {T("View", "देखें")}
                </button>
                <button
                  type="button"
                  className="btn-calc"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                  onClick={() =>
                    openFile(d.id).then((url) => {
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = d.fileName;
                      link.click();
                    })
                  }
                >
                  <Download size={15} /> {T("Download", "डाउनलोड करें")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
