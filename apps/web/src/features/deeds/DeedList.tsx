import type { DeedRecordItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { useDeleteDeed } from "./useDeedRegister";

/** Deed rows shared by My All Deeds and the admin's partner drill-down. */
export function DeedList({
  deeds,
  showCreator,
  canDelete,
}: {
  deeds: DeedRecordItem[];
  showCreator: boolean;
  canDelete: boolean;
}) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const del = useDeleteDeed();

  if (deeds.length === 0) return <p className="doc-empty">{t("drEmpty")}</p>;

  return (
    <div className="doc-list" style={{ marginTop: 12 }}>
      {deeds.map((d) => (
        <div className="msg" key={d.id}>
          <div className="msg-head">
            <span className="msg-name">
              <span className="dr-type">{findDeed(d.type)?.name[lang] ?? d.type}</span> {d.title}
            </span>
            <span className="msg-date">{new Date(d.createdAt).toLocaleString()}</span>
          </div>
          <div className="msg-contacts">
            {showCreator && (
              <span>
                {t("drBy")} <strong>{d.createdByName}</strong>
              </span>
            )}
            {d.district && <span>{showCreator ? " · " : ""}{d.district}</span>}
          </div>
          {d.notes && <p className="msg-body">{d.notes}</p>}
          {canDelete && (
            <a className="dr-delete" onClick={() => del.mutate(d.id)}>
              {t("drDelete")}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
