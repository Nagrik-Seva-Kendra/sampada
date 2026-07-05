import { useMemo, useRef, useState } from "react";
import { guidelineYears, formatGuidelineSession } from "@sampada/shared";
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
const DISTRICT_SUGGESTIONS = [
  "Agar Malwa",
  "Alirajpur",
  "Anuppur",
  "Ashok Nagar",
  "Balaghat",
  "Barwani",
  "Betul",
  "Bhind",
  "Bhopal",
  "Burhanpur",
  "Chhatarpur",
  "Chhindwara",
  "Damoh",
  "Datia",
  "Dewas",
  "Dhar",
  "Dindori",
  "Guna",
  "Gwalior",
  "Harda",
  "Indore",
  "Jabalpur",
  "Jhabua",
  "Katni",
  "Khandwa",
  "Khargone",
  "Mandla",
  "Mandsaur",
  "Morena",
  "Narmadapuram",
  "Narsinghpur",
  "Neemuch",
  "Niwari",
  "Panna",
  "Raisen",
  "Rajgarh",
  "Ratlam",
  "Rewa",
  "Sagar",
  "Satna",
  "Sehore",
  "Seoni",
  "Shahdol",
  "Shajapur",
  "Sheopur",
  "Shivpuri",
  "Sidhi",
  "Singrauli",
  "Tikamgarh",
  "Ujjain",
  "Umaria",
  "Vidisha",
];

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

  const isAdmin = !!useAuthStore((s) => s.user);
  const [district, setDistrict] = useState("");

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
        { year, district: district.trim(), file },
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

        {/* Year selector — 2015 → latest, with PDF counts */}
        <div className="year-bar">
          {years.map((y) => (
            <button
              key={y}
              className={y === year ? "year on" : "year"}
              onClick={() => {
                setYear(y);
                setDistrictFilter("");
              }}
            >
              {formatGuidelineSession(y)}
              <span className="year-count">{countFor(y)}</span>
            </button>
          ))}
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
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
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
                {d}
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
                  <span className="doc-district">{d.district}</span> {d.fileName}
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
