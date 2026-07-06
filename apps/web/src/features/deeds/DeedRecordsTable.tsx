import { useEffect, useMemo, useState } from "react";
import type { DeedType, SampleDeedItem } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { useCanDeleteDeeds, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useCreateSampleDeed, useDeleteSampleDeed, useSampleDeeds } from "./useSampleDeeds";
import { printDeed } from "./printDeed";
import { useScrollLock } from "../../lib/useScrollLock";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/** Staff-managed deed table for one deed type: create, edit, view, print (own deeds; ADMIN: everyone's). */
export function DeedRecordsTable({ type }: { type: DeedType }) {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const isStaff = useIsStaff();
  const canDelete = useCanDeleteDeeds();

  const records = useSampleDeeds(type);
  const create = useCreateSampleDeed();
  const del = useDeleteSampleDeed(type);

  const [viewing, setViewing] = useState<SampleDeedItem | null>(null);
  useScrollLock(!!viewing);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  function onCreate() {
    const name = window.prompt(t("deedsCreateNamePrompt"));
    if (!name || !name.trim()) return;
    create.mutate(
      { type, title: name.trim(), content: "" },
      { onSuccess: (item) => window.open(`/deeds/${type}/edit/${item.id}`, "_blank") },
    );
  }

  /** Duplicate an existing deed's content into a new deed under a new name. */
  function onDuplicate(source: SampleDeedItem) {
    const name = window.prompt(t("deedsCreateNamePrompt"));
    if (!name || !name.trim()) return;
    create.mutate(
      { type, title: name.trim(), content: source.content },
      { onSuccess: (item) => window.open(`/deeds/${type}/edit/${item.id}`, "_blank") },
    );
  }

  function openEdit(item: SampleDeedItem) {
    window.open(`/deeds/${type}/edit/${item.id}`, "_blank");
  }

  function onPrint(item: SampleDeedItem) {
    printDeed(item.title, item.content);
  }

  function onDelete(item: SampleDeedItem) {
    if (window.confirm(t("deedsDeleteConfirm"))) {
      del.mutate(item.id);
    }
  }

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  const allRows = records.data ?? [];
  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return q ? allRows.filter((r) => r.title.toLowerCase().includes(q)) : allRows;
  }, [allRows, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="dr-records">
      {isStaff && (
        <button className="btn-calc" style={{ marginBottom: 12 }} onClick={onCreate}>
          {t("deedsCreateBtn")}
        </button>
      )}
      {create.isError && <p className="modal-error">{t("drSaveFailed")}</p>}

      <input
        className="district-input"
        style={{ display: "block", margin: "0 auto 12px", maxWidth: 320 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("deedsSearchPlaceholder")}
      />

      <div className="dr-table-wrap">
        <table className="dr-table">
          <thead>
            <tr>
              <th>{t("deedsColId")}</th>
              <th>{t("deedsColDate")}</th>
              <th>{t("deedsColName")}</th>
              <th>{t("deedsColUpdate")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                <td>{formatDate(r.createdAt)}</td>
                <td>{r.title}</td>
                <td>
                  <select
                    className="district-input dr-action-select"
                    value=""
                    onChange={(e) => {
                      const action = e.target.value;
                      if (action === "view") setViewing(r);
                      else if (action === "edit") openEdit(r);
                      else if (action === "create") onDuplicate(r);
                      else if (action === "print") onPrint(r);
                      else if (action === "delete") onDelete(r);
                    }}
                  >
                    <option value="" disabled hidden>
                      {t("deedsActionPlaceholder")}
                    </option>
                    <option value="view">{t("deedsViewDeed")}</option>
                    {isStaff && <option value="edit">{t("deedsEditDeed")}</option>}
                    {isStaff && <option value="create">{t("deedsCreateDeedOption")}</option>}
                    <option value="print">{t("deedsPrintDeed")}</option>
                    {canDelete && <option value="delete">{t("deedsDeleteDeed")}</option>}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="doc-empty">
                  {debouncedSearch.trim() ? t("deedsSearchEmpty") : t("drEmpty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > 0 && (
        <div className="dr-pagination">
          <button
            className="doc-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            {t("pagePrev")}
          </button>
          <span>
            {t("pageLabel")} {currentPage} / {totalPages}
          </span>
          <button
            className="doc-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            {t("pageNext")}
          </button>
        </div>
      )}

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{viewing.title}</h3>
              <button className="modal-close" onClick={() => setViewing(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{viewing.content}</p>
          </div>
        </div>
      )}
    </div>
  );
}
