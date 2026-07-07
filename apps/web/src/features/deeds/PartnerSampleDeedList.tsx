import { useState } from "react";
import type { SampleDeedItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { useScrollLock } from "../../lib/useScrollLock";

/** Read-only oversight table: a partner's sample deeds across every category (admin's "All Partner Deeds" page). */
export function PartnerSampleDeedList({ deeds }: { deeds: SampleDeedItem[] }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const [viewing, setViewing] = useState<SampleDeedItem | null>(null);
  useScrollLock(!!viewing);

  if (deeds.length === 0) return <p className="doc-empty">{t("drEmpty")}</p>;

  function onPrint(item: SampleDeedItem) {
    printDeed(item.title, item.content);
  }

  return (
    <div className="dr-records" style={{ marginTop: 12 }}>
      <div className="dr-table-wrap">
        <table className="dr-table">
          <thead>
            <tr>
              <th>{t("deedsColId")}</th>
              <th>{t("deedsColDate")}</th>
              <th>{t("deedsColCategory")}</th>
              <th>{t("deedsColName")}</th>
              <th>{t("deedsColUser")}</th>
              <th>{t("deedsColUpdate")}</th>
            </tr>
          </thead>
          <tbody>
            {deeds.map((d, i) => (
              <tr key={d.id}>
                <td>{i + 1}</td>
                <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                <td>{findDeed(d.type)?.name[lang] ?? d.type}</td>
                <td>{d.title}</td>
                <td>{d.createdByName}</td>
                <td>
                  <select
                    className="district-input dr-action-select"
                    value=""
                    onChange={(e) => {
                      const action = e.target.value;
                      if (action === "view") setViewing(d);
                      else if (action === "print") onPrint(d);
                    }}
                  >
                    <option value="" disabled hidden>
                      {t("deedsActionPlaceholder")}
                    </option>
                    <option value="view">{t("deedsViewDeed")}</option>
                    <option value="print">{t("deedsPrintDeed")}</option>
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
            <p>
              {t("drBy")} <strong>{viewing.createdByName}</strong>
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{viewing.content}</p>
          </div>
        </div>
      )}
    </div>
  );
}
