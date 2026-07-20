import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useScrollLock } from "../../lib/useScrollLock";
import { useDeedRevisions } from "./useSampleDeeds";

/**
 * Staff-only version history panel. Lists every past saved version of a
 * deed (newest first), each one snapshotted automatically whenever a staff
 * member's edit or an AI draft overwrites the deed's content. Read-only --
 * corrections are always made by editing the deed itself.
 */
export function DeedHistoryModal({ deedId, onClose }: { deedId: string; onClose: () => void }) {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  useScrollLock(true);

  const { data: revisions, isLoading, isError } = useDeedRevisions(deedId, true);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("deedHistoryTitle")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {isLoading && <p className="doc-sub">{t("deedHistoryLoading")}</p>}
        {isError && <p className="modal-error">{t("deedHistoryError")}</p>}
        {revisions && revisions.length === 0 && <p className="doc-empty">{t("deedHistoryEmpty")}</p>}

        {revisions && revisions.length > 0 && (
          <ul className="deed-history-list">
            {revisions.map((rev) => (
              <li key={rev.id} className="deed-history-item">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <strong>
                    {t("deedHistoryVersion")} {rev.versionNo}
                  </strong>
                  <span className="doc-sub" style={{ fontSize: 12, opacity: 0.7 }}>
                    {new Date(rev.createdAt).toLocaleString()}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0" }}>{rev.title}</p>
                {rev.editedByName && (
                  <p className="doc-sub" style={{ fontSize: 12, opacity: 0.7, margin: "2px 0 0" }}>
                    {rev.editedByName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="doc-btn" onClick={onClose}>
            {t("deedHistoryClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
