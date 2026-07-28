import { Link } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import type { PropertyCategory, PropertyStatus } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminProperties, useDeleteProperty, useUpdateProperty } from "./useProperties";

const STATUS_PILL: Record<PropertyStatus, string> = {
  DRAFT: "neutral",
  PUBLISHED: "good",
  ARCHIVED: "bad",
};

const CATEGORY_KEY: Record<PropertyCategory, StringKey> = {
  PLOT: "propertyCategoryPlot",
  VILLA: "propertyCategoryVilla",
  FLAT: "propertyCategoryFlat",
  AGRICULTURAL_LAND: "propertyCategoryAgriLand",
};

function formatPrice(value: number | null, label: string | null): string {
  if (label) return label;
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN")}`;
}

/** Staff: every property listing (any status) that feeds the public property site. */
export function PropertiesListPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);

  const query = useAdminProperties();
  const update = useUpdateProperty();
  const del = useDeleteProperty();

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  function onDelete(id: string) {
    if (window.confirm(t("propertiesDeleteConfirm"))) del.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("propertiesTitle")}
        </div>
        <div className="page-head">
          <h2 className="page-title">{t("propertiesTitle")}</h2>
          <Link to="/properties/new" className="btn-calc">
            {t("propertiesNewBtn")}
          </Link>
        </div>

        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>{t("propertiesColTitle")}</th>
                <th>{t("propertiesColCategory")}</th>
                <th>{t("propertiesColCity")}</th>
                <th>{t("propertiesColPrice")}</th>
                <th>{t("propertiesColStatus")}</th>
                <th>{t("platformColActions")}</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="doc-empty">
                    {t("propertiesEmpty")}
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700 }}>{p.title}</td>
                  <td>{t(CATEGORY_KEY[p.category])}</td>
                  <td>{p.city}</td>
                  <td>{formatPrice(p.priceValue, p.priceLabel)}</td>
                  <td>
                    <span className={`status-pill ${STATUS_PILL[p.status]}`}>{p.status}</span>
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("platformColActions")}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent shadow-xs outline-none"
                        >
                          <MoreVertical className="size-4 opacity-70" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/properties/$id/edit" params={{ id: p.id }}>
                            {t("propertiesActionEdit")}
                          </Link>
                        </DropdownMenuItem>
                        {p.status !== "PUBLISHED" && (
                          <DropdownMenuItem
                            onSelect={() => update.mutate({ id: p.id, input: { status: "PUBLISHED" } })}
                          >
                            {t("propertiesActionPublish")}
                          </DropdownMenuItem>
                        )}
                        {p.status !== "ARCHIVED" && (
                          <DropdownMenuItem
                            onSelect={() => update.mutate({ id: p.id, input: { status: "ARCHIVED" } })}
                          >
                            {t("propertiesActionArchive")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(p.id)}>
                          {t("propertiesActionDelete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {query.hasNextPage && (
          <div className="dr-pagination">
            <button
              type="button"
              className="doc-btn"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {t("platformLoadMore")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
