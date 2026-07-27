import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDownIcon, FileText, MoreVertical } from "lucide-react";
import { DeedType, type ListDeedsQuery, type SampleDeedListItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useCanDeleteDeeds, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { downloadDeedPdf } from "./deedPdf";
import {
  useAllDeeds,
  useCreateSampleDeed,
  useDeedCreators,
  useDeleteAnyDeed,
  useFetchSampleDeed,
  usePendingCorrectionIds,
} from "./useSampleDeeds";
import { DeedViewModal } from "./DeedViewModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { DeedDocumentsPanel } from "./DeedDocumentsPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 25;
const ALL = "__all__";

/** Shared height/box-sizing so the type dropdown trigger lines up with the shadcn Selects beside it. */
const FILTER_CONTROL_STYLE: CSSProperties = {
  height: 36,
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  width: "auto",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/** Admin/Employee: every deed across all users/types in one searchable, filterable table. */
export function AllDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const isStaff = useIsStaff();
  const canDelete = useCanDeleteDeeds();

  const [selectedTypes, setSelectedTypes] = useState<Set<DeedType>>(new Set());
  const [createdById, setCreatedById] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters: ListDeedsQuery = useMemo(
    () => ({
      ...(selectedTypes.size ? { types: [...selectedTypes] } : {}),
      ...(createdById ? { createdById } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    [selectedTypes, createdById, dateFrom, dateTo],
  );
  const hasFilters = Object.keys(filters).length > 0;

  const deeds = useAllDeeds(filters);
  const creators = useDeedCreators();
  const pendingCorrectionIds = usePendingCorrectionIds();
  const flaggedIds = useMemo(() => new Set(pendingCorrectionIds.data ?? []), [pendingCorrectionIds.data]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SampleDeedListItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  const create = useCreateSampleDeed();
  const del = useDeleteAnyDeed();
  const fetchDeed = useFetchSampleDeed();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => setPage(1), [debounced, filters]);

  const rows = deeds.data ?? [];
  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (d) => d.title.toLowerCase().includes(q) || (d.createdByName ?? "").toLowerCase().includes(q),
    );
  }, [rows, debounced]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function clearFilters() {
    setSelectedTypes(new Set());
    setCreatedById("");
    setDateFrom("");
    setDateTo("");
  }

  function openEdit(d: SampleDeedListItem) {
    window.open(`/deeds/${d.type}/edit/${d.id}`, "_blank");
  }

  async function onDuplicate(d: SampleDeedListItem) {
    setBusy(true);
    try {
      const full = await fetchDeed(d.id);
      create.mutate(
        { type: d.type, title: t("deedsUntitledTitle"), content: full.content },
        { onSuccess: (item) => window.open(`/deeds/${d.type}/edit/${item.id}?new=1`, "_blank") },
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPrint(d: SampleDeedListItem) {
    setBusy(true);
    try {
      const full = await fetchDeed(d.id);
      printDeed(full.title, full.content);
    } finally {
      setBusy(false);
    }
  }

  /** Rows carry no body (LIST_SELECT drops it), so fetch the deed before rendering it. */
  async function onDownloadPdf(d: SampleDeedListItem) {
    setBusy(true);
    setPdfFailed(false);
    try {
      const full = await fetchDeed(d.id);
      await downloadDeedPdf(full.title, full.content);
    } catch {
      setPdfFailed(true);
    } finally {
      setBusy(false);
    }
  }


  function confirmDelete() {
    if (!pendingDelete) return;
    del.mutate(
      { id: pendingDelete.id, type: pendingDelete.type },
      { onSuccess: () => setPendingDelete(null) },
    );
  }

  return (
    <section className="page">
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 28px" }}>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              margin: 0,
              color: "var(--accent)",
              letterSpacing: "-0.01em",
            }}
          >
            {t("allDeedsTitle")}
          </h2>
          {deeds.data && (
            <span style={{ fontSize: 13, opacity: 0.65 }}>
              {debounced.trim()
                ? `${t("allDeedsMatches")}: ${filtered.length} / ${rows.length}`
                : `${t("allDeedsTotal")}: ${rows.length}`}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            margin: "0 0 12px",
          }}
        >
          <div style={{ position: "relative", width: 340, maxWidth: "100%" }}>
            <input
              className="district-input"
              style={{ display: "block", width: "100%", paddingRight: 32, boxSizing: "border-box" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("allDeedsSearch")}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("allDeedsSearchClear")}
                title={t("allDeedsSearchClear")}
                style={{
                  position: "absolute",
                  top: "50%",
                  right: 8,
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  padding: 0,
                  border: "none",
                  borderRadius: "50%",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  opacity: 0.6,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginLeft: "auto" }}>
            <TypeFilter selected={selectedTypes} onChange={setSelectedTypes} t={t} lang={lang} />

            <Select value={createdById || ALL} onValueChange={(v) => setCreatedById(v === ALL ? "" : v)}>
              <SelectTrigger size="sm">
                <SelectValue placeholder={t("allDeedsFilterAllCreators")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allDeedsFilterAllCreators")}</SelectItem>
                {(creators.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="date"
              className="district-input"
              style={{ ...FILTER_CONTROL_STYLE, width: 150 }}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={t("allDeedsFilterDateFrom")}
              title={t("allDeedsFilterDateFrom")}
            />
            <span style={{ opacity: 0.5, fontSize: 12 }}>–</span>
            <input
              type="date"
              className="district-input"
              style={{ ...FILTER_CONTROL_STYLE, width: 150 }}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label={t("allDeedsFilterDateTo")}
              title={t("allDeedsFilterDateTo")}
            />

            {hasFilters && (
              <button
                type="button"
                className="doc-btn"
                style={{ height: FILTER_CONTROL_STYLE.height, boxSizing: "border-box" }}
                onClick={clearFilters}
              >
                {t("allDeedsFilterClear")}
              </button>
            )}
          </div>
        </div>

        {deeds.isError && <p className="modal-error">{t("drError")}</p>}
        {pdfFailed && <p className="modal-error">{t("deedsPdfFailed")}</p>}

        <div className="dr-records">
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>{t("deedsColId")}</th>
                  <th>{t("deedsColDate")}</th>
                  <th>{t("deedsColName")}</th>
                  <th>{t("deedsColCategory")}</th>
                  <th>{t("deedsColStatus")}</th>
                  <th>{t("deedsColUser")}</th>
                  <th>{t("deedsAction")}</th>
                </tr>
              </thead>
              <tbody>
                {deeds.isLoading &&
                  Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td colSpan={7}>
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))}
                {!deeds.isLoading &&
                  pageRows.map((d, i) => (
                    <Fragment key={d.id}>
                      <tr>
                        <td className="dr-cell-sno" data-label={t("deedsColId")}>
                          {(current - 1) * PAGE_SIZE + i + 1}
                        </td>
                        <td data-label={t("deedsColDate")}>{formatDate(d.createdAt)}</td>
                        <td className="dr-cell-name" data-label={t("deedsColName")}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {d.title}
                            {flaggedIds.has(d.id) && (
                              <span
                                title={lang === "hi" ? "Party ne correction bataya hai" : "Party flagged a correction"}
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: "#8a6300",
                                  background: "#fff3d6",
                                  borderRadius: 999,
                                  padding: "2px 8px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ⚠ Correction
                              </span>
                            )}
                          </span>
                        </td>
                        <td data-label={t("deedsColCategory")}>{findDeed(d.type)?.name[lang] ?? d.type}</td>
                        <td data-label={t("deedsColStatus")}>
                          <span className={d.status === "active" ? "dr-status-active" : "modal-error"}>
                            {t(d.status === "active" ? "deedStatusActive" : "deedStatusInactive")}
                          </span>
                        </td>
                        <td data-label={t("deedsColUser")}>{d.createdByName}</td>
                        <td className="dr-cell-action" data-label={t("deedsAction")}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-label={t("deedsActionPlaceholder")}
                                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent shadow-xs outline-none disabled:opacity-50"
                                >
                                  <MoreVertical className="size-4 opacity-70" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setViewId(d.id)}>
                                  {t("deedsViewDeed")}
                                </DropdownMenuItem>

                                {isStaff && (
                                  <>
                                    <DropdownMenuItem onSelect={() => openEdit(d)}>
                                      {t("deedsEditDeed")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => void onDuplicate(d)}>
                                      {t("deedsCreateDeedOption")}
                                    </DropdownMenuItem>
                                    {canDelete && (
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => setPendingDelete(d)}
                                      >
                                        {t("deedsDeleteDeed")}
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}

                                <DropdownMenuItem onSelect={() => void onPrint(d)}>
                                  {t("deedsPrintDeed")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void onDownloadPdf(d)}>
                                  {t("deedsDownloadPdf")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <button
                              type="button"
                              aria-label="Documents"
                              title={lang === "hi" ? "दस्तावेज़ (आधार / नक्शा)" : "Documents (Aadhaar / Map)"}
                              onClick={() => setExpandedId((cur) => (cur === d.id ? null : d.id))}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent shadow-xs outline-none"
                              style={
                                expandedId === d.id
                                  ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                                  : undefined
                              }
                            >
                              <FileText className="size-4 opacity-80" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === d.id && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0, background: "rgba(0,0,0,0.12)" }}>
                            <DeedDocumentsPanel deedId={d.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                {!deeds.isLoading && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="doc-empty">
                      {debounced.trim() ? t("deedsSearchEmpty") : t("drEmpty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="dr-pagination">
              <button className="doc-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current <= 1}>
                {t("pagePrev")}
              </button>
              <span>
                {t("pageLabel")} {current} / {totalPages}
              </span>
              <button
                className="doc-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={current >= totalPages}
              >
                {t("pageNext")}
              </button>
            </div>
          )}
        </div>
      </div>

      {viewId && (
        <DeedViewModal id={viewId} onClose={() => setViewId(null)} showCategory showCreator />
      )}

      {pendingDelete && (
        <ConfirmDeleteModal
          title={t("deedsDeleteTitle")}
          message={t("deedsDeleteConfirm")}
          itemName={pendingDelete.title}
          confirmLabel={t("deedsDeleteDeed")}
          pendingLabel={t("deedsDeleting")}
          cancelLabel={t("cancel")}
          pending={del.isPending}
          error={del.isError ? t("deedsDeleteFailed") : null}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

/** Multi-select checkbox dropdown for deed type, backed by a real server-side filter. */
function TypeFilter({
  selected,
  onChange,
  t,
  lang,
}: {
  selected: Set<DeedType>;
  onChange: (next: Set<DeedType>) => void;
  t: (k: StringKey) => string;
  lang: "en" | "hi";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  function toggle(type: DeedType) {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  }

  const label = selected.size
    ? `${t("allDeedsFilterType")} (${selected.size})`
    : t("allDeedsFilterAllTypes");

  return (
    <div className={"nav-dd" + (open ? " open" : "")} ref={ref}>
      <button
        type="button"
        className="flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none data-[state=open]:border-ring"
        data-state={open ? "open" : "closed"}
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
        <ChevronDownIcon className="size-4 opacity-50" />
      </button>
      <div className="nav-dd-menu" role="menu" style={{ left: 0, transform: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {DeedType.options.map((type) => (
            <label key={type} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(type)} onChange={() => toggle(type)} />
              {findDeed(type)?.name[lang] ?? type}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
