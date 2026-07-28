import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import type { OrgStatus } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCancelOrganization,
  usePlatformOrganizations,
  useReactivateOrganization,
  useSuspendOrganization,
} from "./usePlatformOrganizations";

const STATUS_PILL: Record<OrgStatus, string> = {
  TRIALING: "neutral",
  ACTIVE: "good",
  PAST_DUE: "warn",
  SUSPENDED: "warn",
  CANCELLED: "bad",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Platform-admin only: every organization on the platform — the "Sampada management" app's home page. */
export function PlatformOrganizationsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const [search, setSearch] = useState("");

  const query = usePlatformOrganizations(search);
  const suspend = useSuspendOrganization();
  const reactivate = useReactivateOrganization();
  const cancel = useCancelOrganization();

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  function onCancel(id: string, name: string) {
    if (window.confirm(`${t("platformCancelConfirm")}\n\n${name}`)) cancel.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("platformOrgsTitle")}
        </div>
        <div className="page-head">
          <h2 className="page-title">{t("platformOrgsTitle")}</h2>
          <input
            type="text"
            className="doc-btn"
            style={{ minWidth: 260 }}
            placeholder={t("platformOrgsSearchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>{t("platformColName")}</th>
                <th>{t("platformColSlug")}</th>
                <th>{t("platformColStatus")}</th>
                <th>{t("platformColMembers")}</th>
                <th>{t("platformColCreated")}</th>
                <th>{t("platformColActions")}</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="doc-empty">
                    {t("platformEmpty")}
                  </td>
                </tr>
              )}
              {rows.map((org) => (
                <tr key={org.id}>
                  <td>
                    <Link to="/platform/organizations/$id" params={{ id: org.id }} style={{ fontWeight: 700 }}>
                      {org.name}
                    </Link>
                    {org.isPersonal && (
                      <span className="status-pill neutral" style={{ marginLeft: 8 }}>
                        {t("platformPersonalBadge")}
                      </span>
                    )}
                  </td>
                  <td>{org.slug}</td>
                  <td>
                    <span className={`status-pill ${STATUS_PILL[org.status]}`}>{org.status}</span>
                  </td>
                  <td>{org.memberCount}</td>
                  <td>{formatDate(org.createdAt)}</td>
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
                          <Link to="/platform/organizations/$id" params={{ id: org.id }}>
                            {t("platformActionView")}
                          </Link>
                        </DropdownMenuItem>
                        {org.status !== "SUSPENDED" && org.status !== "CANCELLED" && (
                          <DropdownMenuItem onSelect={() => suspend.mutate(org.id)}>
                            {t("platformActionSuspend")}
                          </DropdownMenuItem>
                        )}
                        {(org.status === "SUSPENDED" || org.status === "PAST_DUE") && (
                          <DropdownMenuItem onSelect={() => reactivate.mutate(org.id)}>
                            {t("platformActionReactivate")}
                          </DropdownMenuItem>
                        )}
                        {org.status !== "CANCELLED" && (
                          <DropdownMenuItem variant="destructive" onSelect={() => onCancel(org.id, org.name)}>
                            {t("platformActionCancel")}
                          </DropdownMenuItem>
                        )}
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
