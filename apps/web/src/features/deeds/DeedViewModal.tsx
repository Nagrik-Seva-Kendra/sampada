import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{d ? d.title : "…"}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {deed.isError && <p className="modal-error">{t("drError")}</p>}
        {d && (
          <>
            {showCategory && (
              <p>
                <strong>{findDeed(d.type)?.name[lang] ?? d.type}</strong>
              </p>
            )}
            {showCreator && (
              <p>
                {t("drBy")} <strong>{d.createdByName}</strong>
              </p>
            )}
            <p style={{ whiteSpace: "pre-wrap" }}>{d.content}</p>
            <button
              className="btn-calc"
              style={{ marginTop: 12 }}
              onClick={() => printDeed(d.title, d.content)}
            >
              {t("deedsPrintDeed")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
