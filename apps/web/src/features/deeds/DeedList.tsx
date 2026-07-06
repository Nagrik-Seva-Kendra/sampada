import { useState } from "react";
import type { DeedRecordItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { useScrollLock } from "../../lib/useScrollLock";
import { useDeleteDeed } from "./useDeedRegister";

/** Deed table shared by My All Deeds and the admin's partner drill-down. */
export function DeedList({
  deeds,
  showCreator,
  canDelete,
  canEdit = false,
}: {
  deeds: DeedRecordItem[];
  showCreator: boolean;
  canDelete: boolean;
  canEdit?: boolean;
}) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const del = useDeleteDeed();
  const [viewing, setViewing] = useState<DeedRecordItem | null>(null);
  useScrollLock(!!viewing);

  if (deeds.length === 0) return <p className="doc-empty">{t("drEmpty")}</p>;

  function onEdit(d: DeedRecordItem) {
    window.open(`/my-deeds/edit/${d.id}?creatorId=${d.createdById}`, "_blank");
  }

  function onPrint(d: DeedRecordItem) {
    const typeName = findDeed(d.type)?.name[lang] ?? d.type;
    const lines = [d.district, d.notes].filter(Boolean).join("\n\n");
    printDeed(d.title, `${typeName}\n\n${lines}`);
  }

  function onDelete(d: DeedRecordItem) {
    if (window.confirm(t("deedsDeleteConfirm"))) {
      del.mutate(d.id);
    }
  }

  return (
    <div className="dr-records" style={{ marginTop: 12 }}>
      <div className="dr-table-wrap">
        <table className="dr-table">
          <thead>
            <tr>
              <th>{t("deedsColId")}</th>
              <th>{t("deedsColDate")}</th>
              <th>{t("deedsColName")}</th>
              {showCreator && <th>{t("deedsColUser")}</th>}
              <th>{t("deedsColUpdate")}</th>
            </tr>
          </thead>
          <tbody>
            {deeds.map((d, i) => (
              <tr key={d.id}>
                <td>{i + 1}</td>
                <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                <td>
                  <span className="dr-type">{findDeed(d.type)?.name[lang] ?? d.type}</span> {d.title}
                </td>
                {showCreator && <td>{d.createdByName}</td>}
                <td>
                  <select
                    className="district-input dr-action-select"
                    value=""
                    onChange={(e) => {
                      const action = e.target.value;
                      if (action === "view") setViewing(d);
                      else if (action === "edit") onEdit(d);
                      else if (action === "print") onPrint(d);
                      else if (action === "delete") onDelete(d);
                    }}
                  >
                    <option value="" disabled hidden>
                      {t("deedsActionPlaceholder")}
                    </option>
                    <option value="view">{t("deedsViewDeed")}</option>
                    {canEdit && <option value="edit">{t("deedsEditDeed")}</option>}
                    <option value="print">{t("deedsPrintDeed")}</option>
                    {canDelete && <option value="delete">{t("deedsDeleteDeed")}</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{viewing.title}</h3>
              <button className="modal-close" onClick={() => setViewing(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <p>
              <strong>{findDeed(viewing.type)?.name[lang] ?? viewing.type}</strong>
            </p>
            {showCreator && (
              <p>
                {t("drBy")} <strong>{viewing.createdByName}</strong>
              </p>
            )}
            {viewing.district && <p>{viewing.district}</p>}
            {viewing.notes && <p style={{ whiteSpace: "pre-wrap" }}>{viewing.notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
