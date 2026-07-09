import { useState } from "react";
import type { SampleDeedListItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { DeedViewModal } from "./DeedViewModal";
import { useFetchSampleDeed } from "./useSampleDeeds";

/** Read-only oversight table: a partner's sample deeds across every category (admin's "All Partner Deeds" page). */
export function PartnerSampleDeedList({ deeds }: { deeds: SampleDeedListItem[] }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchDeed = useFetchSampleDeed();

  async function onPrint(item: SampleDeedListItem) {
    setBusy(true);
    try {
      const full = await fetchDeed(item.id);
      printDeed(full.title, full.content);
    } finally {
      setBusy(false);
    }
  }

  if (deeds.length === 0) return <p className="doc-empty">{t("drEmpty")}</p>;

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
                    disabled={busy}
                    onChange={(e) => {
                      const action = e.target.value;
                      if (action === "view") setViewingId(d.id);
                      else if (action === "print") void onPrint(d);
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

      {viewingId && (
        <DeedViewModal
          id={viewingId}
          onClose={() => setViewingId(null)}
          showCategory
          showCreator
        />
      )}
    </div>
  );
}
