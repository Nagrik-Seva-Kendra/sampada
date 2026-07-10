import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import type { StaffRole } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { useScrollLock } from "../../lib/useScrollLock";
import { apiErrorMessage } from "../../lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApproveEmployee,
  useCreateUser,
  useDeactivateEmployee,
  useEmployeePassword,
  usePendingEmployees,
  useReactivateEmployee,
  useRejectEmployee,
  useStaffList,
} from "./useEmployees";

type Tab = "requests" | "users";

/** Admin only: signup approval queue (Requests) + the full staff directory with an Add-User form (User Management). */
export function TeamPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const [tab, setTab] = useState<Tab>("requests");
  const pending = usePendingEmployees();
  const pendingCount = pending.data?.length ?? 0;

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navManageTeam")}
        </div>
        <h2 className="page-title">{t("navManageTeam")}</h2>

        <div className="login-tabs team-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "requests"}
            className={tab === "requests" ? "on" : ""}
            onClick={() => setTab("requests")}
          >
            {t("teamTabRequests")}
            {pendingCount > 0 && <span className="team-badge">{pendingCount}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "users"}
            className={tab === "users" ? "on" : ""}
            onClick={() => setTab("users")}
          >
            {t("teamTabUsers")}
          </button>
        </div>

        {tab === "requests" ? <RequestsTab t={t} /> : <UsersTab t={t} />}
      </div>
    </section>
  );
}

/** Placeholder rows shown while a tab's list is loading. */
function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="doc-list" style={{ marginTop: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          className="doc"
          key={i}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div className="doc-meta" style={{ flex: 1 }}>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" style={{ marginTop: 10 }} />
          </div>
          <div className="doc-actions">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pending employee self-signups awaiting approval. */
function RequestsTab({ t }: { t: (k: StringKey) => string }) {
  const pending = usePendingEmployees();
  const approve = useApproveEmployee();
  const reject = useRejectEmployee();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function onReject(id: string) {
    if (window.confirm(t("reqRejectConfirm"))) reject.mutate(id);
  }

  return (
    <>
      {(approve.isError || reject.isError) && <p className="modal-error">{t("reqActionFailed")}</p>}

      {pending.isLoading && <SkeletonRows />}

      {!pending.isLoading && (pending.data ?? []).length === 0 && (
        <p className="doc-empty">{t("empReqEmpty")}</p>
      )}

      <div className="doc-list" style={{ marginTop: 16 }}>
        {(pending.data ?? []).map((req) => (
          <div className="doc" key={req.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="doc-meta">
                <div className="doc-name">
                  {req.fname} {req.lname}
                  {req.employeeCode && (
                    <span className="doc-sub" style={{ marginLeft: 8 }}>
                      [{req.employeeCode}]
                    </span>
                  )}
                </div>
                <div className="doc-sub">
                  {req.email} · {req.phone} · {t("reqRequestedOn")}{" "}
                  {new Date(req.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="doc-actions">
                <button
                  className="doc-btn"
                  onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                >
                  {expandedId === req.id ? t("empHideDetails") : t("empViewDetails")}
                </button>
                <button className="doc-btn" onClick={() => approve.mutate(req.id)} disabled={approve.isPending}>
                  {t("reqApprove")}
                </button>
                <button
                  className="doc-btn danger"
                  onClick={() => onReject(req.id)}
                  disabled={reject.isPending}
                >
                  {t("reqReject")}
                </button>
              </div>
            </div>
            {expandedId === req.id && <StaffDetails id={req.id} username={req.username} t={t} />}
          </div>
        ))}
      </div>
    </>
  );
}

/** The full staff directory (employees + admins) plus the Add-User entry point. */
function UsersTab({ t }: { t: (k: StringKey) => string }) {
  const staff = useStaffList();
  const deactivate = useDeactivateEmployee();
  const reactivate = useReactivateEmployee();
  const selfId = useAuthStore((s) => s.user?.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  function onDeactivate(id: string) {
    if (window.confirm(t("reqDiscontinueConfirm"))) deactivate.mutate(id);
  }

  return (
    <>
      <div className="team-toolbar">
        {staff.isLoading ? (
          <Skeleton className="h-4 w-28" />
        ) : (
          <p className="doc-sub" style={{ margin: 0 }}>
            {(staff.data ?? []).length} {t("teamUsersCount")}
          </p>
        )}
        <button
          className="btn-calc"
          onClick={() => setAddOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
        >
          <UserPlus size={17} strokeWidth={2.2} />
          {t("teamCreateUser")}
        </button>
      </div>

      {(deactivate.isError || reactivate.isError) && <p className="modal-error">{t("reqActionFailed")}</p>}

      {staff.isLoading && <SkeletonRows />}

      {!staff.isLoading && (staff.data ?? []).length === 0 && (
        <p className="doc-empty">{t("teamUsersEmpty")}</p>
      )}

      <div className="doc-list" style={{ marginTop: 16 }}>
        {(staff.data ?? []).map((u) => {
          const isEmployee = u.role === "EMPLOYEE";
          const isSelf = u.id === selfId;
          return (
            <div className="doc" key={u.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div className="doc-meta">
                  <div className="doc-name">
                    {u.fname} {u.lname}
                    {u.employeeCode && (
                      <span className="doc-sub" style={{ marginLeft: 8 }}>
                        [{u.employeeCode}]
                      </span>
                    )}
                    <span className={"team-role " + (isEmployee ? "emp" : "adm")} style={{ marginLeft: 8 }}>
                      {t(isEmployee ? "teamRoleEmployee" : "teamRoleAdmin")}
                    </span>
                    <span
                      className={u.status === "ACTIVE" ? "dr-status-active" : "modal-error"}
                      style={{ marginLeft: 8 }}
                    >
                      {t(u.status === "ACTIVE" ? "reqStatusActive" : "reqStatusInactive")}
                    </span>
                  </div>
                  <div className="doc-sub">
                    {u.email} · {u.phone ?? "—"}
                  </div>
                </div>
                <div className="doc-actions">
                  <button
                    className="doc-btn"
                    onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                  >
                    {expandedId === u.id ? t("empHideDetails") : t("empViewDetails")}
                  </button>
                  {/* Only employee services can be discontinued; admins stay active, and you can't discontinue yourself. */}
                  {isEmployee && !isSelf && u.status === "ACTIVE" && (
                    <button className="doc-btn danger" onClick={() => onDeactivate(u.id)} disabled={deactivate.isPending}>
                      {t("reqDiscontinue")}
                    </button>
                  )}
                  {isEmployee && u.status === "INACTIVE" && (
                    <button className="doc-btn" onClick={() => reactivate.mutate(u.id)} disabled={reactivate.isPending}>
                      {t("reqReactivate")}
                    </button>
                  )}
                </div>
              </div>
              {expandedId === u.id && <StaffDetails id={u.id} username={u.username} t={t} />}
            </div>
          );
        })}
      </div>

      {addOpen && <AddUserModal t={t} onClose={() => setAddOpen(false)} />}
    </>
  );
}

/** Expandable row: shows the login username and (on demand) the recoverable password. */
function StaffDetails({
  id,
  username,
  t,
}: {
  id: string;
  username: string | null;
  t: (k: StringKey) => string;
}) {
  const reveal = useEmployeePassword();

  return (
    <div className="doc-sub" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div>
        {t("empUsername")}: {username ?? "—"}
      </div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <span>
          {t("empPassword")}: {reveal.data ? reveal.data.password : "••••••••"}
        </span>
        <button
          className="doc-btn"
          onClick={() => (reveal.data ? reveal.reset() : reveal.mutate(id))}
          disabled={reveal.isPending}
        >
          {reveal.data ? t("empHidePassword") : t("empShowPassword")}
        </button>
      </div>
      {reveal.isError && <p className="modal-error">{t("empPasswordFailed")}</p>}
    </div>
  );
}

/** Admin creates an employee or another admin. No OTP; the account is active at once. */
function AddUserModal({
  t,
  onClose,
}: {
  t: (k: StringKey) => string;
  onClose: () => void;
}) {
  const create = useCreateUser();
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("EMPLOYEE");
  const [error, setError] = useState<string | null>(null);

  useScrollLock(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedUsername = username.trim();
    create.mutate(
      {
        fname: fname.trim(),
        lname: lname.trim(),
        email: email.trim(),
        phone: phone.trim(),
        username: trimmedUsername || undefined,
        password,
        role,
      },
      {
        onError: async (err) => setError(await apiErrorMessage(err, t("reqActionFailed"))),
      },
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-card--form"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{t("addUserTitle")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {create.isSuccess ? (
          <div className="modal-form">
            <p className="dr-status-active">✓ {t("addUserSuccess")}</p>
            <button type="button" className="btn-calc modal-submit" onClick={onClose}>
              {t("addUserDone")}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="modal-form">
            <div className="form-grid">
              <label className="modal-field">
                {t("profileFname")}
                <input value={fname} onChange={(e) => setFname(e.target.value)} required maxLength={100} autoFocus />
              </label>
              <label className="modal-field">
                {t("profileLname")}
                <input value={lname} onChange={(e) => setLname(e.target.value)} required maxLength={100} />
              </label>
              <label className="modal-field">
                {t("profileEmail")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="modal-field">
                {t("authPhone")}
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  pattern="[0-9]{10}"
                  maxLength={10}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="modal-field">
                {t("addUserUsername")}
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
                  maxLength={50}
                  placeholder={t("addUserUsernamePlaceholder")}
                  autoComplete="off"
                />
              </label>
              <label className="modal-field">
                {t("addUserRole")}
                <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                  <option value="EMPLOYEE">{t("teamRoleEmployee")}</option>
                  <option value="ADMIN">{t("teamRoleAdmin")}</option>
                </select>
              </label>
              <label className="modal-field form-field--full">
                {t("authPassword")}
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <button className="btn-calc modal-submit" type="submit" disabled={create.isPending}>
              {create.isPending ? "…" : t("addUserSubmit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
