import { useState } from "react";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { downloadDeedPdf } from "./deedPdf";
import { useSampleDeed } from "./useSampleDeeds";
import { useScrollLock } from "../../lib/useScrollLock";

/**
 * Deed viewer. Lists carry metadata only, so the body is fetched here on open
 * rather than shipped with every row (see sample-deeds.service.ts LIST_SELECT).
 */
export function DeedViewModal({
  id,
  onClose,
  showCategory = false,
  showCreator = false,
}: {
  id: string;
  onClose: () => void;
  showCategory?: boolean;
  showCreator?: boolean;
}) {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const deed = useSampleDeed(id);
  useScrollLock(true);
  const d = deed.data;

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  async function onDownloadPdf() {
    if (!d) return;
    setPdfBusy(true);
    setPdfFailed(false);
    try {
      await downloadDeedPdf(d.title, d.content);
    } catch {
      setPdfFailed(true);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-card--deed"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{d ? d.title : t("drLoading")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="deed-modal-body">
          {deed.isLoading && (
            <div className="deed-modal-loader">
              <span className="spinner" aria-hidden />
              <p>{t("drLoading")}</p>
            </div>
          )}
          {deed.isError && <p className="modal-error">{t("drError")}</p>}
          {d && (
            <>
              {(showCategory || showCreator) && (
                <div className="deed-modal-meta">
                  {showCategory && (
                    <span className="deed-type-tag">{findDeed(d.type)?.name[lang] ?? d.type}</span>
                  )}
                  {showCreator && (
                    <span className="doc-sub">
                      {t("drBy")} <strong>{d.createdByName}</strong>
                    </span>
                  )}
                </div>
              )}
              <p style={{ whiteSpace: "pre-wrap" }}>{d.content}</p>
            </>
          )}
        </div>

        {d && (
          <div className="deed-modal-foot">
            {pdfFailed && <p className="modal-error">{t("deedsPdfFailed")}</p>}
            <button className="btn-calc" onClick={() => printDeed(d.title, d.content)}>
              {t("deedsPrintDeed")}
            </button>
            <button className="doc-btn" onClick={() => void onDownloadPdf()} disabled={pdfBusy}>
              {pdfBusy ? "…" : t("deedsDownloadPdf")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
