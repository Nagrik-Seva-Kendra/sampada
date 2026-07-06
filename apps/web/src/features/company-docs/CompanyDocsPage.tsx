import { useRef, useState } from "react";
import type { CompanyDocCategory } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  useCompanyDocs,
  useCreateSite,
  useDeleteCompanyDoc,
  useDeleteSite,
  useOpenCompanyDoc,
  useSites,
  useUploadCompanyDoc,
} from "./useCompanyDocs";

const CATEGORIES: { value: CompanyDocCategory; key: StringKey }[] = [
  { value: "town-country-planning", key: "cdCatTcp" },
  { value: "nagar-nigam", key: "cdCatNagarNigam" },
  { value: "aadhar-card", key: "cdCatAadhar" },
  { value: "pan-card", key: "cdCatPan" },
  { value: "layout", key: "cdCatLayout" },
  { value: "old-registry", key: "cdCatOldRegistry" },
  { value: "other", key: "cdCatOther" },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Admin only: file company documents (permissions, Aadhar cards, etc.) under a site. */
export function CompanyDocsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);

  const sites = useSites();
  const createSite = useCreateSite();
  const [siteId, setSiteId] = useState("");
  const [newSiteName, setNewSiteName] = useState("");

  const docs = useCompanyDocs(siteId || null);
  const upload = useUploadCompanyDoc();
  const del = useDeleteCompanyDoc();
  const deleteSite = useDeleteSite();
  const openDoc = useOpenCompanyDoc();

  const [category, setCategory] = useState<CompanyDocCategory>("town-country-planning");
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function onAddSite(e: React.FormEvent) {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    createSite.mutate(
      { name: newSiteName.trim() },
      { onSuccess: (site) => { setNewSiteName(""); setSiteId(site.id); } },
    );
  }

  function onUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (file && siteId) {
      upload.mutate(
        { siteId, category, label: label.trim(), file },
        { onSuccess: () => { setLabel(""); if (fileRef.current) fileRef.current.value = ""; } },
      );
    }
  }

  function onDelete(id: string) {
    if (siteId && window.confirm(t("cdDeleteConfirm"))) {
      del.mutate({ siteId, id });
    }
  }

  function onDeleteSite() {
    if (siteId && window.confirm(t("cdDeleteSiteConfirm"))) {
      deleteSite.mutate(siteId, { onSuccess: () => setSiteId("") });
    }
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navCompanyDocs")}
        </div>
        <h2 className="page-title">{t("cdTitle")}</h2>

        <form className="dr-form" onSubmit={onAddSite} style={{ marginTop: 20 }}>
          <div className="dr-form-grid">
            <label className="modal-field">
              {t("cdSite")}
              <select
                className="district-input"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">{t("cdSelectSite")}</option>
                {(sites.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.docCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              {t("cdNewSiteName")}
              <input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                maxLength={150}
              />
            </label>
          </div>
          {createSite.isError && <p className="modal-error">{t("cdSiteCreateFailed")}</p>}
          <button className="btn-calc" type="submit" disabled={createSite.isPending || !newSiteName.trim()}>
            {createSite.isPending ? "…" : t("cdAddSite")}
          </button>
        </form>

        {(sites.data ?? []).length === 0 && !sites.isLoading && (
          <p className="doc-empty">{t("cdNoSites")}</p>
        )}

        {siteId && (
          <>
            <button
              className="doc-btn danger"
              style={{ marginTop: 12 }}
              onClick={onDeleteSite}
              disabled={deleteSite.isPending}
            >
              {t("cdDeleteSite")}
            </button>

            <form className="upload" onSubmit={onUpload} style={{ marginTop: 24 }}>
              <p className="upload-hint">{t("glOnlyPdf")}</p>
              <div className="upload-row">
                <select
                  className="district-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CompanyDocCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.key)}
                    </option>
                  ))}
                </select>
                <input
                  className="district-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t("cdLabelPlaceholder")}
                  maxLength={200}
                />
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" />
                <button className="btn-calc" type="submit" disabled={upload.isPending}>
                  {upload.isPending ? "…" : t("cdUploadBtn")}
                </button>
              </div>
              {upload.isError && <p className="upload-error">{t("cdUploadFailed")}</p>}
            </form>

            <div className="doc-list" style={{ marginTop: 16 }}>
              {(docs.data ?? []).map((d) => (
                <div className="doc" key={d.id}>
                  <span className="doc-icon">📄</span>
                  <div className="doc-meta">
                    <div className="doc-name">
                      <span className="doc-district">{t(CATEGORIES.find((c) => c.value === d.category)!.key)}</span>{" "}
                      {d.label && <>— {d.label}</>}
                    </div>
                    <div className="doc-sub">
                      {d.fileName} · {formatSize(d.sizeBytes)} · {new Date(d.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="doc-actions">
                    <button className="doc-btn" onClick={() => openDoc(d.url, d.fileName, "view")}>
                      {t("cdView")}
                    </button>
                    <button className="doc-btn" onClick={() => openDoc(d.url, d.fileName, "download")}>
                      {t("cdDownload")}
                    </button>
                    <button className="doc-btn danger" onClick={() => onDelete(d.id)} disabled={del.isPending}>
                      {t("cdDelete")}
                    </button>
                  </div>
                </div>
              ))}
              {(docs.data ?? []).length === 0 && !docs.isLoading && (
                <p className="doc-empty">{t("cdNoDocs")}</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
