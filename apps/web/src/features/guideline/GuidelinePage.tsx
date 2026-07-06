import { useMemo, useRef, useState } from "react";
import { guidelineYears, formatGuidelineSession, type Language } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  useGuidelineYears,
  useGuidelineDocs,
  useUploadGuidelinePdf,
  useDeleteGuidelineDoc,
} from "./useGuideline";

// All Madhya Pradesh districts — upload district dropdown options.
// Stored/filtered by the English name; Hindi is only the display label.
const DISTRICT_SUGGESTIONS: { en: string; hi: string }[] = [
  { en: "Agar Malwa", hi: "आगर मालवा" },
  { en: "Alirajpur", hi: "अलीराजपुर" },
  { en: "Anuppur", hi: "अनूपपुर" },
  { en: "Ashok Nagar", hi: "अशोकनगर" },
  { en: "Balaghat", hi: "बालाघाट" },
  { en: "Barwani", hi: "बड़वानी" },
  { en: "Betul", hi: "बेतूल" },
  { en: "Bhind", hi: "भिण्ड" },
  { en: "Bhopal", hi: "भोपाल" },
  { en: "Burhanpur", hi: "बुरहानपुर" },
  { en: "Chhatarpur", hi: "छतरपुर" },
  { en: "Chhindwara", hi: "छिन्दवाड़ा" },
  { en: "Damoh", hi: "दमोह" },
  { en: "Datia", hi: "दतिया" },
  { en: "Dewas", hi: "देवास" },
  { en: "Dhar", hi: "धार" },
  { en: "Dindori", hi: "डिंडोरी" },
  { en: "Guna", hi: "गुना" },
  { en: "Gwalior", hi: "ग्वालियर" },
  { en: "Harda", hi: "हरदा" },
  { en: "Indore", hi: "इन्दौर" },
  { en: "Jabalpur", hi: "जबलपुर" },
  { en: "Jhabua", hi: "झाबुआ" },
  { en: "Katni", hi: "कटनी" },
  { en: "Khandwa", hi: "खण्डवा" },
  { en: "Khargone", hi: "खरगोन" },
  { en: "Mandla", hi: "मंडला" },
  { en: "Mandsaur", hi: "मन्दसौर" },
  { en: "Morena", hi: "मुरैना" },
  { en: "Narmadapuram", hi: "नर्मदापुरम" },
  { en: "Narsinghpur", hi: "नरसिंहपुर" },
  { en: "Neemuch", hi: "नीमच" },
  { en: "Niwari", hi: "निवाड़ी" },
  { en: "Panna", hi: "पन्ना" },
  { en: "Raisen", hi: "रायसेन" },
  { en: "Rajgarh", hi: "राजगढ़" },
  { en: "Ratlam", hi: "रतलाम" },
  { en: "Rewa", hi: "रीवा" },
  { en: "Sagar", hi: "सागर" },
  { en: "Satna", hi: "सतना" },
  { en: "Sehore", hi: "सीहोर" },
  { en: "Seoni", hi: "सिवनी" },
  { en: "Shahdol", hi: "शहडोल" },
  { en: "Shajapur", hi: "शाजापुर" },
  { en: "Sheopur", hi: "श्योपुर" },
  { en: "Shivpuri", hi: "शिवपुरी" },
  { en: "Sidhi", hi: "सीधी" },
  { en: "Singrauli", hi: "सिंगरौली" },
  { en: "Tikamgarh", hi: "टीकमगढ़" },
  { en: "Ujjain", hi: "उज्जैन" },
  { en: "Umaria", hi: "उमरिया" },
  { en: "Vidisha", hi: "विदिशा" },
];

const DISTRICT_HI_BY_EN = new Map(DISTRICT_SUGGESTIONS.map((d) => [d.en, d.hi]));

function districtLabel(en: string, lang: Language): string {
  return lang === "hi" ? DISTRICT_HI_BY_EN.get(en) ?? en : en;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function GuidelinePage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const years = useMemo(() => guidelineYears(), []);
  const [year, setYear] = useState<number>(years[0]!);
  const [districtFilter, setDistrictFilter] = useState<string>("");

  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const [district, setDistrict] = useState("");
  const [language, setLanguage] = useState<Language>("en");

  const yearsInfo = useGuidelineYears();
  const docs = useGuidelineDocs(year);
  const upload = useUploadGuidelinePdf();
  const del = useDeleteGuidelineDoc();

  const countFor = (y: number) =>
    yearsInfo.data?.find((i) => i.year === y)?.count ?? 0;

  const fileRef = useRef<HTMLInputElement>(null);
  function onUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (file && district.trim()) {
      upload.mutate(
        { year, district: district.trim(), language, file },
        { onSuccess: () => fileRef.current && (fileRef.current.value = "") },
      );
    }
  }

  const all = docs.data ?? [];
  const districts = useMemo(
    () => Array.from(new Set(all.map((d) => d.district))).sort(),
    [all],
  );
  const list = districtFilter
    ? all.filter((d) => d.district === districtFilter)
    : all;

  return (
    <section className="page">
      <div className="wrap">
        <div className="page-head">
          <h2 className="page-title">{t("glGuidelinePdfs")}</h2>
        </div>

        {/* Upload — admin only, district-wise */}
        {isAdmin ? (
          <form className="upload" onSubmit={onUpload}>
            <div className="upload-head">
              {t("glUploadFor")} <strong>{formatGuidelineSession(year)}</strong>
            </div>
            <p className="upload-hint">{t("glOnlyPdf")}</p>
            <div className="upload-row">
              <select
                className="district-input"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                required
              >
                <option value="" disabled>
                  {t("glDistrict")}
                </option>
                {DISTRICT_SUGGESTIONS.map((d) => (
                  <option key={d.en} value={d.en}>
                    {districtLabel(d.en, lang)}
                  </option>
                ))}
              </select>
              <select
                className="district-input"
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  setDistrictFilter("");
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {formatGuidelineSession(y)}
                  </option>
                ))}
              </select>
              <select
                className="district-input"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="en">{t("glLangEnglish")}</option>
                <option value="hi">{t("glLangHindi")}</option>
              </select>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" />
              <button
                className="btn-calc"
                type="submit"
                disabled={upload.isPending || !district.trim()}
              >
                {upload.isPending ? "…" : t("glUploadBtn")}
              </button>
            </div>
            {upload.isError && <p className="upload-error">{t("glUploadFailed")}</p>}
          </form>
        ) : (
          <p className="admin-note">🔒 {t("glAdminNote")}</p>
        )}

        {/* District filter (only if multiple districts present) */}
        {districts.length > 0 && (
          <div className="district-bar">
            <button
              className={districtFilter === "" ? "district-chip on" : "district-chip"}
              onClick={() => setDistrictFilter("")}
            >
              {t("glAllDistricts")}
            </button>
            {districts.map((d) => (
              <button
                key={d}
                className={districtFilter === d ? "district-chip on" : "district-chip"}
                onClick={() => setDistrictFilter(d)}
              >
                {districtLabel(d, lang)}
              </button>
            ))}
          </div>
        )}

        {/* PDF list — public */}
        <div className="doc-list">
          {list.map((d) => (
            <div className="doc" key={d.id}>
              <span className="doc-icon">📄</span>
              <div className="doc-meta">
                <div className="doc-name">
                  <span className="doc-district">{districtLabel(d.district, lang)}</span>{" "}
                  <span className="doc-lang">{d.language === "hi" ? t("glLangHindi") : t("glLangEnglish")}</span>{" "}
                  {d.fileName}
                </div>
                <div className="doc-sub">
                  {formatGuidelineSession(d.year)} · {formatSize(d.sizeBytes)} ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="doc-actions">
                <a href={d.url} target="_blank" rel="noreferrer" className="doc-btn">
                  {t("glView")}
                </a>
                <a href={d.url} download={d.fileName} className="doc-btn">
                  {t("glDownload")}
                </a>
                {isAdmin && (
                  <button
                    className="doc-btn danger"
                    onClick={() => del.mutate({ year: d.year, id: d.id })}
                    disabled={del.isPending}
                  >
                    {t("glDelete")}
                  </button>
                )}
              </div>
            </div>
          ))}
          {list.length === 0 && !docs.isLoading && (
            <p className="doc-empty">{t("glNoPdfs")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
