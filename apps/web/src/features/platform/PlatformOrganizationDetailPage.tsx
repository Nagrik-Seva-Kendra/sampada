import { Link, useParams } from "@tanstack/react-router";
import type { MemberStatus, OrgRole, OrgStatus } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCancelOrganization,
  usePlatformOrganization,
  useReactivateOrganization,
  useSuspendOrganization,
  useUpdateMembership,
} from "./usePlatformOrganizations";

const STATUS_PILL: Record<OrgStatus, string> = {
  TRIALING: "neutral",
  ACTIVE: "good",
  PAST_DUE: "warn",
  SUSPENDED: "warn",
  CANCELLED: "bad",
};
const MEMBER_STATUS_PILL: Record<MemberStatus, string> = {
  PENDING: "neutral",
  ACTIVE: "good",
  INACTIVE: "bad",
};

const ROLES: OrgRole[] = ["OWNER", "ADMIN", "EMPLOYEE"];
const MEMBER_STATUSES: MemberStatus[] = ["ACTIVE", "INACTIVE", "PENDING"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Platform-admin only: one organization's full detail + member roster, with suspend/reactivate/cancel actions. */
export function PlatformOrganizationDetailPage() {
  // Nested under the pathless "dashboard" layout route, so its typed route id
  // is prefixed with "/dashboard" even though the real URL (and Link "to") has
  // no such segment — see DashboardLayout's dashboardLayoutRoute (id: "dashboard").
  const { id } = useParams({ from: "/dashboard/platform/organizations/$id" });
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);

  const org = usePlatformOrganization(id);
  const suspend = useSuspendOrganization();
  const reactivate = useReactivateOrganization();
  const cancel = useCancelOrganization();
  const updateMembership = useUpdateMembership();

  function onCancel() {
    if (!org.data) return;
    if (window.confirm(`${t("platformCancelConfirm")}\n\n${org.data.name}`)) cancel.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <Link to="/platform/organizations" className="kicker" style={{ textDecoration: "none" }}>
          <span className="rule" />
          {t("platformBackToList")}
        </Link>

        {org.isLoading && <Skeleton className="h-24 w-full" style={{ marginTop: 16 }} />}

        {org.data && (
          <>
            <div className="page-head">
              <div>
                <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {org.data.name}
                  <span className={`status-pill ${STATUS_PILL[org.data.status]}`}>{org.data.status}</span>
                  {org.data.isPersonal && <span className="status-pill neutral">{t("platformPersonalBadge")}</span>}
                </h2>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  /{org.data.slug} &middot; {t("platformJoinCode")}: {org.data.joinCode} &middot;{" "}
                  {formatDate(org.data.createdAt)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {org.data.status !== "SUSPENDED" && org.data.status !== "CANCELLED" && (
                  <button type="button" className="doc-btn" onClick={() => suspend.mutate(id)}>
                    {t("platformActionSuspend")}
                  </button>
                )}
                {(org.data.status === "SUSPENDED" || org.data.status === "PAST_DUE") && (
                  <button type="button" className="doc-btn" onClick={() => reactivate.mutate(id)}>
                    {t("platformActionReactivate")}
                  </button>
                )}
                {org.data.status !== "CANCELLED" && (
                  <button type="button" className="doc-btn danger" onClick={onCancel}>
                    {t("platformActionCancel")}
                  </button>
                )}
              </div>
            </div>

            <h3 style={{ margin: "24px 0 10px", fontSize: 16, fontWeight: 700 }}>{t("platformMembersHeading")}</h3>
            <div className="dr-table-wrap">
              <table className="dr-table">
                <thead>
                  <tr>
                    <th>{t("platformColMemberName")}</th>
                    <th>{t("platformColRole")}</th>
                    <th>{t("platformColStatus")}</th>
                    <th>{t("platformColEmployeeCode")}</th>
                  </tr>
                </thead>
                <tbody>
                  {org.data.members.map((m) => (
                    <tr key={m.membershipId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{m.name}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>{m.email}</div>
                      </td>
                      <td>
                        <select
                          className="dr-action-select"
                          value={m.role}
                          disabled={updateMembership.isPending}
                          onChange={(e) =>
                            updateMembership.mutate({
                              organizationId: id,
                              membershipId: m.membershipId,
                              input: { role: e.target.value as OrgRole },
                            })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="dr-action-select"
                          value={m.status}
                          disabled={updateMembership.isPending}
                          onChange={(e) =>
                            updateMembership.mutate({
                              organizationId: id,
                              membershipId: m.membershipId,
                              input: { status: e.target.value as MemberStatus },
                            })
                          }
                        >
                          {MEMBER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <span className={`status-pill ${MEMBER_STATUS_PILL[m.status]}`} style={{ marginLeft: 8 }}>
                          {m.status}
                        </span>
                      </td>
                      <td>{m.employeeCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {updateMembership.isError && <p className="modal-error">{updateMembership.error.message}</p>}
          </>
        )}
      </div>
    </section>
  );
}
