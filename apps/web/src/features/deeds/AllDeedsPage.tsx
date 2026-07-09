import { useEffect, useMemo, useState } from "react";
import type { SampleDeedListItem } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { printDeed } from "./printDeed";
import { useScrollLock } from "../../lib/useScrollLock";
import { useAllDeeds, useSampleDeed } from "./useSampleDeeds";

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/** Admin/Employee: every deed across all users/types in one searchable table. */
export function AllDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const deeds = useAllDeeds();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => setPage(1), [debounced]);

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

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("allDeedsKicker")}
        </div>
        <h2 className="page-title">{t("allDeedsTitle")}</h2>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            margin: "12px 0 4px",
          }}
        >
          {deeds.data && (
            <span style={{ fontSize: 14, opacity: 0.75 }}>
              {debounced.trim()
                ? `${t("allDeedsMatches")}: ${filtered.length} / ${rows.length}`
                : `${t("allDeedsTotal")}: ${rows.length}`}
            </span>
          )}
          <div style={{ position: "relative", width: 340, maxWidth: "100%", marginLeft: "auto" }}>
            <input
              className="district-input"
              style={{ display: "block", width: "100%", paddingRight: 32 }}
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
        </div>

        {deeds.isError && <p className="modal-error">{t("drError")}</p>}

        <div className="dr-records" style={{ marginTop: 12 }}>
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>{t("deedsColId")}</th>
                  <th>{t("deedsColDate")}</th>
                  <th>{t("deedsColName")}</th>
                  <th>{t("deedsColStatus")}</th>
                  <th>{t("deedsColUser")}</th>
                  <th>{t("deedsAction")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d, i) => (
                  <tr key={d.id}>
                    <td>{(current - 1) * PAGE_SIZE + i + 1}</td>
                    <td>{formatDate(d.createdAt)}</td>
                    <td>{d.title}</td>
                    <td>
                      <span className={d.status === "active" ? "dr-status-active" : "modal-error"}>
                        {t(d.status === "active" ? "deedStatusActive" : "deedStatusInactive")}
                      </span>
                    </td>
                    <td>{d.createdByName}</td>
                    <td>
                      <select
                        className="district-input dr-action-select"
                        value=""
                        onChange={(e) => {
                          if (e.target.value === "view") setViewId(d.id);
                        }}
                      >
                        <option value="" disabled hidden>
                          {t("deedsActionPlaceholder")}
                        </option>
                        <option value="view">{t("deedsViewDeed")}</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="doc-empty">
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

      {viewId && <DeedViewModal id={viewId} onClose={() => setViewId(null)} t={t} lang={lang} />}
    </section>
  );
}

function DeedViewModal({
  id,
  onClose,
  t,
  lang,
}: {
  id: string;
  onClose: () => void;
  t: (k: StringKey) => string;
  lang: "en" | "hi";
}) {
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
            <p>
              <strong>{findDeed(d.type)?.name[lang] ?? d.type}</strong> · {t("drBy")}{" "}
              <strong>{d.createdByName}</strong>
            </p>
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
