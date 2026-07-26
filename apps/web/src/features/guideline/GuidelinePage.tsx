import { useState } from "react";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import type { Language } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  MP_DISTRICTS,
  formatSession,
  guidelineSessions,
  useGuidelineFileOpener,
  useGuidelineList,
  useDeleteGuideline,
  useImportGuideline,
  useUploadGuideline,
  type GuidelineImportItem,
} from "./useGuideline";

const SESSIONS = guidelineSessions();

export function GuidelinePage() {
  const lang = useUiStore((s) => s.lang);
  const T = (en: string, hi: string) => (lang === "hi" ? hi : en);
  const t = (k: StringKey) => translate(k, lang);
  const isPlatformAdmin = useAuthStore((s) => !!s.user?.isPlatformAdmin);

  const [district, setDistrict] = useState("");
  const [session, setSession] = useState("");
  // Always follows the site's EN/HI toggle — whichever language is selected
  // is the one shown and downloaded, no separate picker on this page.
  const { data, isLoading, isError } = useGuidelineList({
    district: district || undefined,
    session: session ? Number(session) : undefined,
    language: lang,
  });
  const docs = data ?? [];
  const openFile = useGuidelineFileOpener();
  const deleteDoc = useDeleteGuideline();

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

        {isPlatformAdmin && <ManageGuidelineSection t={t} />}

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
                {isPlatformAdmin && (
                  <button
                    type="button"
                    className="doc-btn danger"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                    onClick={() => {
                      if (window.confirm(t("guidelineDeleteConfirm"))) deleteDoc.mutate(d.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Platform-admin-only: upload one PDF, or bulk-import many from URLs (e.g. an official government site). */
function ManageGuidelineSection({ t }: { t: (k: StringKey) => string }) {
  const upload = useUploadGuideline();
  const importDocs = useImportGuideline();

  const [title, setTitle] = useState("");
  const [district, setDistrict] = useState<string>(MP_DISTRICTS[0] ?? "");
  const [session, setSession] = useState<string>(String(SESSIONS[0] ?? ""));
  const [language, setLanguage] = useState<Language>("en");
  const [file, setFile] = useState<File | null>(null);

  const [importText, setImportText] = useState("");

  function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    upload.mutate(
      { title: title.trim() || file.name, district, session: Number(session), language, file },
      { onSuccess: () => { setTitle(""); setFile(null); } },
    );
  }

  function parseImportText(text: string): GuidelineImportItem[] {
    const items: GuidelineImportItem[] = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const [d, s, langRaw, ti, u] = line.split(",").map((p) => p.trim());
      const session = Number(s);
      const language: Language = langRaw === "hi" ? "hi" : "en";
      if (!d || !session || !u) continue;
      items.push({ district: d, session, language, title: ti, url: u });
    }
    return items;
  }

  function onImport(e: React.FormEvent) {
    e.preventDefault();
    const items = parseImportText(importText);
    if (items.length === 0) return;
    importDocs.mutate({ items });
  }

  return (
    <div
      style={{
        marginTop: 16,
        marginBottom: 8,
        padding: 16,
        border: "1px solid var(--accent)",
        borderRadius: "var(--radius)",
        background: "var(--accent-soft)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{t("guidelineManageTitle")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <form onSubmit={onUpload} className="modal-form">
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{t("guidelineUploadTitle")}</div>
          <label className="modal-field">
            {t("guidelineTitleLabel")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="modal-field">
            {t("guidelineDistrictLabel")}
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              {MP_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            {t("guidelineSessionLabel")}
            <select value={session} onChange={(e) => setSession(e.target.value)}>
              {SESSIONS.map((y) => (
                <option key={y} value={y}>
                  {formatSession(y)}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            {t("guidelineLanguageLabel")}
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </label>
          <label className="modal-field">
            {t("guidelineFileLabel")}
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {upload.isError && <p className="modal-error">{upload.error.message}</p>}
          <button type="submit" className="btn-calc" disabled={!file || upload.isPending}>
            <Upload size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {upload.isPending ? "…" : t("guidelineUploadSubmit")}
          </button>
        </form>

        <form onSubmit={onImport} className="modal-form">
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{t("guidelineImportTitle")}</div>
          <label className="modal-field">
            {t("guidelineImportHint")}
            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Indore, 2015, en, Indore Guideline 2015-16, https://example.gov.in/...pdf"}
            />
          </label>
          {importDocs.isPending && <p className="dr-status-active">{t("guidelineImportRunning")}</p>}
          {importDocs.isError && <p className="modal-error">{importDocs.error.message}</p>}
          {importDocs.data && (
            <p className="dr-status-active">
              ✓ {importDocs.data.imported} imported, {importDocs.data.failed} failed
            </p>
          )}
          <button type="submit" className="btn-calc" disabled={!importText.trim() || importDocs.isPending}>
            {importDocs.isPending ? "…" : t("guidelineImportSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}
