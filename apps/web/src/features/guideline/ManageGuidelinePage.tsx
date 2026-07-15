import { useRef, useState, type FormEvent } from "react";
import { useUiStore } from "../../stores/uiStore";
import {
  MP_DISTRICTS,
  formatSession,
  guidelineFileUrl,
  guidelineSessions,
  useDeleteGuideline,
  useGuidelineList,
  useUploadGuideline,
} from "./useGuideline";
import { FileText, Trash2, UploadCloud } from "lucide-react";

const SESSIONS = guidelineSessions();

export function ManageGuidelinePage() {
  const lang = useUiStore((s) => s.lang);
  const T = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterSession, setFilterSession] = useState("");
  const { data, isLoading } = useGuidelineList({
    district: filterDistrict || undefined,
    session: filterSession ? Number(filterSession) : undefined,
  });
  const upload = useUploadGuideline();
  const del = useDeleteGuideline();
  const docs = data ?? [];

  const [title, setTitle] = useState("");
  const [district, setDistrict] = useState("");
  const [session, setSession] = useState(String(SESSIONS[0]));
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr(T("Enter a title for this document.", "इस दस्तावेज़ के लिए एक शीर्षक दर्ज करें।"));
      return;
    }
    if (!district) {
      setErr(T("Choose a district.", "एक जिला चुनें।"));
      return;
    }
    if (!session) {
      setErr(T("Choose a session.", "एक सत्र चुनें।"));
      return;
    }
    if (!file) {
      setErr(T("Choose a PDF file.", "एक PDF फ़ाइल चुनें।"));
      return;
    }
    if (file.type !== "application/pdf") {
      setErr(T("Only PDF files are allowed.", "केवल PDF फ़ाइलें ही मान्य हैं।"));
      return;
    }
    upload.mutate(
      { title: title.trim(), district, session: Number(session), file },
      {
        onSuccess: () => {
          setTitle("");
          setFile(null);
          if (fileRef.current) fileRef.current.value = "";
        },
        onError: (e) => setErr(e.message),
      },
    );
  }

  function onDelete(id: string) {
    if (!window.confirm(T("Delete this document?", "यह दस्तावेज़ हटाएं?"))) return;
    del.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {T("Admin", "एडमिन")}
        </div>
        <h2 className="page-title">{T("Manage Guideline", "गाइडलाइन प्रबंधन")}</h2>
        <p className="er-sub">
          {T(
            "Upload PDF documents by district and session — they'll be visible and downloadable by everyone on the Guideline page.",
            "जिले और सत्र के अनुसार PDF दस्तावेज़ अपलोड करें — ये गाइडलाइन पेज पर सभी को दिखेंगे और डाउनलोड के लिए उपलब्ध होंगे।",
          )}
        </p>

        <form
          onSubmit={onSubmit}
          style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", marginTop: 16, marginBottom: 24 }}
        >
          <select
            className="district-input"
            style={{ flex: "1 1 180px" }}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">{T("District", "जिला")}</option>
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
            {SESSIONS.map((y) => (
              <option key={y} value={y}>
                {formatSession(y)}
              </option>
            ))}
          </select>
          <input
            className="district-input"
            style={{ flex: "1 1 220px" }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={T("Document title", "दस्तावेज़ शीर्षक")}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ flex: "1 1 220px" }}
          />
          <button
            type="submit"
            className="btn-calc"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            disabled={upload.isPending}
          >
            <UploadCloud size={15} /> {upload.isPending ? T("Uploading…", "अपलोड हो रहा…") : T("Upload", "अपलोड करें")}
          </button>
        </form>
        {err && <p className="modal-error">{err}</p>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <select
            className="district-input"
            style={{ flex: "1 1 180px" }}
            value={filterDistrict}
            onChange={(e) => setFilterDistrict(e.target.value)}
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
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
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
        {!isLoading && docs.length === 0 && (
          <p style={{ opacity: 0.6 }}>{T("No documents uploaded yet.", "अभी कोई दस्तावेज़ अपलोड नहीं हुआ।")}</p>
        )}

        {docs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {docs.map((d) => {
              const removing = del.isPending && del.variables === d.id;
              return (
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
                  <a
                    className="doc-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}
                    href={guidelineFileUrl(d.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {T("View", "देखें")}
                  </a>
                  <button
                    type="button"
                    className="doc-btn"
                    disabled={removing}
                    onClick={() => onDelete(d.id)}
                    title={T("Delete", "हटाएं")}
                  >
                    {removing ? T("Deleting…", "हटाया जा रहा है…") : <Trash2 size={15} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
