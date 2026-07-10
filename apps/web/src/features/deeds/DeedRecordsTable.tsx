import { useEffect, useMemo, useState } from "react";
import type { DeedType, SampleDeedListItem } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { useAuthStore, useCanDeleteDeeds, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  useCreateSampleDeed,
  useDeleteSampleDeed,
  useFetchSampleDeed,
  useSampleDeeds,
} from "./useSampleDeeds";
import { printDeed } from "./printDeed";
import { DeedViewModal } from "./DeedViewModal";

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
  const role = useAuthStore((s) => s.user?.role);
  // ADMIN/EMPLOYEE see every staff member's sample deeds combined (see sample-deeds.service.ts) — show who made each one.
  const showCreator = role === "ADMIN" || role === "EMPLOYEE";

  const records = useSampleDeeds(type);
  const create = useCreateSampleDeed();
  const del = useDeleteSampleDeed(type);
  const fetchDeed = useFetchSampleDeed();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  // No name prompt — create a blank draft and open the editor, where the user types the title.
  function onCreate() {
    create.mutate(
      { type, title: t("deedsUntitledTitle"), content: "" },
      { onSuccess: (item) => window.open(`/deeds/${type}/edit/${item.id}?new=1`, "_blank") },
    );
  }

  /** Duplicate an existing deed's content into a new draft; the user retitles it in the editor. */
  async function onDuplicate(source: SampleDeedListItem) {
    setBusy(true);
    try {
      const full = await fetchDeed(source.id);
      create.mutate(
        { type, title: t("deedsUntitledTitle"), content: full.content },
        { onSuccess: (item) => window.open(`/deeds/${type}/edit/${item.id}?new=1`, "_blank") },
      );
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: SampleDeedListItem) {
    window.open(`/deeds/${type}/edit/${item.id}`, "_blank");
  }

  async function onPrint(item: SampleDeedListItem) {
    setBusy(true);
    try {
      const full = await fetchDeed(item.id);
      printDeed(full.title, full.content);
    } finally {
      setBusy(false);
    }
  }

  function onDelete(item: SampleDeedListItem) {
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
              {showCreator && <th>{t("deedsColUser")}</th>}
              <th>{t("deedsColUpdate")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                <td>{formatDate(r.createdAt)}</td>
                <td>{r.title}</td>
                {showCreator && <td>{r.createdByName}</td>}
                <td>
                  <select
                    className="district-input dr-action-select"
                    value=""
                    disabled={busy}
                    onChange={(e) => {
                      const action = e.target.value;
                      if (action === "view") setViewingId(r.id);
                      else if (action === "edit") openEdit(r);
                      else if (action === "create") void onDuplicate(r);
                      else if (action === "print") void onPrint(r);
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
                <td colSpan={showCreator ? 5 : 4} className="doc-empty">
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

      {viewingId && (
        <DeedViewModal
          id={viewingId}
          onClose={() => setViewingId(null)}
          showCreator={showCreator}
        />
      )}
    </div>
  );
}
