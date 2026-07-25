import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import type { EmployeeItem, StaffRole, UpdateUserInput } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { useScrollLock } from "../../lib/useScrollLock";
import { apiErrorMessage } from "../../lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApproveEmployee,
  useCancelOwnershipTransfer,
  useCreateInvite,
  useCreateOwnershipTransfer,
  useCreateUser,
  useDeactivateUser,
  useInvites,
  useOwnershipTransfers,
  usePendingEmployees,
  useReactivateUser,
  useRejectEmployee,
  useRevokeInvite,
  useSendResetLink,
  useStaffList,
  useUpdateUser,
} from "./useEmployees";

type Tab = "requests" | "users" | "invites" | "ownership";

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
          <button
            type="button"
            role="tab"
            aria-selected={tab === "invites"}
            className={tab === "invites" ? "on" : ""}
            onClick={() => setTab("invites")}
          >
            {t("teamTabInvites")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ownership"}
            className={tab === "ownership" ? "on" : ""}
            onClick={() => setTab("ownership")}
          >
            {t("teamTabOwnership")}
          </button>
        </div>

        {tab === "requests" ? (
          <RequestsTab t={t} />
        ) : tab === "users" ? (
          <UsersTab t={t} />
        ) : tab === "invites" ? (
          <InvitesTab t={t} />
        ) : (
          <OwnershipTab t={t} />
        )}
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
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const selfId = useAuthStore((s) => s.user?.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeItem | null>(null);

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
                  <button className="doc-btn" onClick={() => setEditing(u)}>
                    {t("editUserEdit")}
                  </button>
                  {/* Any staff member's services can be discontinued (employee, admin, or owner) — except your own. */}
                  {!isSelf && u.status === "ACTIVE" && (
                    <button className="doc-btn danger" onClick={() => onDeactivate(u.id)} disabled={deactivate.isPending}>
                      {t("reqDiscontinue")}
                    </button>
                  )}
                  {u.status === "INACTIVE" && (
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
      {editing && <EditUserModal t={t} user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Invite someone by email to join with a chosen role; list and revoke live invites. */
function InvitesTab({ t }: { t: (k: StringKey) => string }) {
  const invites = useInvites();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("EMPLOYEE");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => { setEmail(""); setCopied(false); },
        onError: async (err) => setError(await apiErrorMessage(err, t("reqActionFailed"))),
      },
    );
  }

  function onRevoke(id: string) {
    if (window.confirm(t("inviteRevokeConfirm"))) revoke.mutate(id);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the URL is visible for manual copy anyway.
    }
  }

  return (
    <>
      <form onSubmit={onCreate} className="modal-form" style={{ marginTop: 16, maxWidth: 480 }}>
        <div className="form-grid">
          <label className="modal-field">
            {t("inviteEmailLabel")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="modal-field">
            {t("inviteRoleLabel")}
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="EMPLOYEE">{t("teamRoleEmployee")}</option>
              <option value="ADMIN">{t("teamRoleAdmin")}</option>
            </select>
          </label>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <button className="btn-calc modal-submit" type="submit" disabled={create.isPending || !email.trim()}>
          {create.isPending ? "…" : t("inviteCreateSubmit")}
        </button>
      </form>

      {create.data && (
        <div className="doc-sub" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              readOnly
              value={create.data.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="doc-btn" onClick={() => copy(create.data!.inviteUrl)}>
              {copied ? t("inviteLinkCopied") : t("inviteLinkCopy")}
            </button>
          </div>
          <small>{create.data.emailed ? t("inviteLinkEmailed") : t("inviteLinkNotEmailed")}</small>
        </div>
      )}

      {invites.isLoading && <SkeletonRows />}

      {!invites.isLoading && (invites.data ?? []).length === 0 && (
        <p className="doc-empty">{t("inviteEmpty")}</p>
      )}

      <div className="doc-list" style={{ marginTop: 16 }}>
        {(invites.data ?? []).map((inv) => (
          <div className="doc" key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="doc-meta">
              <div className="doc-name">
                {inv.email}
                <span className={"team-role " + (inv.role === "EMPLOYEE" ? "emp" : "adm")} style={{ marginLeft: 8 }}>
                  {t(inv.role === "EMPLOYEE" ? "teamRoleEmployee" : "teamRoleAdmin")}
                </span>
              </div>
              <div className="doc-sub">
                {t("inviteCreatedOn")} {new Date(inv.createdAt).toLocaleDateString()} ·{" "}
                {t("inviteExpiresOn")} {new Date(inv.expiresAt).toLocaleDateString()}
              </div>
            </div>
            <div className="doc-actions">
              <button className="doc-btn danger" onClick={() => onRevoke(inv.id)} disabled={revoke.isPending}>
                {t("inviteRevoke")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Nominate an existing active admin as the new owner; list and cancel a live
 * transfer. The server enforces that only the real Owner can use this — every
 * Admin sees the tab, but a non-Owner gets a clear permission error on submit
 * (the web app has no client-side signal distinguishing Owner from Admin).
 */
function OwnershipTab({ t }: { t: (k: StringKey) => string }) {
  const staff = useStaffList();
  const transfers = useOwnershipTransfers();
  const create = useCreateOwnershipTransfer();
  const cancel = useCancelOwnershipTransfer();
  const selfId = useAuthStore((s) => s.user?.id);
  const [toUserId, setToUserId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const admins = (staff.data ?? []).filter((u) => u.role === "ADMIN" && u.status === "ACTIVE" && u.id !== selfId);

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!toUserId) return;
    create.mutate(
      { toUserId },
      {
        onSuccess: () => setCopied(false),
        onError: async (err) => setError(await apiErrorMessage(err, t("reqActionFailed"))),
      },
    );
  }

  function onCancel(id: string) {
    if (window.confirm(t("transferCancelConfirm"))) cancel.mutate(id);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the URL is visible for manual copy anyway.
    }
  }

  return (
    <>
      <form onSubmit={onCreate} className="modal-form" style={{ marginTop: 16, maxWidth: 480 }}>
        <label className="modal-field">
          {t("transferNomineeLabel")}
          <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
            <option value="" disabled>
              {t("transferNomineePlaceholder")}
            </option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fname} {a.lname} ({a.email})
              </option>
            ))}
          </select>
        </label>
        {error && <p className="modal-error">{error}</p>}
        <button className="btn-calc modal-submit" type="submit" disabled={create.isPending || !toUserId}>
          {create.isPending ? "…" : t("transferCreateSubmit")}
        </button>
      </form>

      {create.data && (
        <div className="doc-sub" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              readOnly
              value={create.data.transferUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="doc-btn" onClick={() => copy(create.data!.transferUrl)}>
              {copied ? t("inviteLinkCopied") : t("inviteLinkCopy")}
            </button>
          </div>
          <small>{create.data.emailed ? t("inviteLinkEmailed") : t("inviteLinkNotEmailed")}</small>
        </div>
      )}

      {transfers.isLoading && <SkeletonRows />}

      {!transfers.isLoading && (transfers.data ?? []).length === 0 && (
        <p className="doc-empty">{t("transferEmpty")}</p>
      )}

      <div className="doc-list" style={{ marginTop: 16 }}>
        {(transfers.data ?? []).map((tr) => {
          const nominee = (staff.data ?? []).find((u) => u.id === tr.toUserId);
          return (
            <div className="doc" key={tr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="doc-meta">
                <div className="doc-name">{nominee ? `${nominee.fname} ${nominee.lname}` : tr.toUserId}</div>
                <div className="doc-sub">
                  {t("inviteCreatedOn")} {new Date(tr.createdAt).toLocaleDateString()} ·{" "}
                  {t("inviteExpiresOn")} {new Date(tr.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <div className="doc-actions">
                <button className="doc-btn danger" onClick={() => onCancel(tr.id)} disabled={cancel.isPending}>
                  {t("transferCancel")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Expandable row: shows the login username and lets an admin generate a
 * single-use password reset link. Passwords are never recoverable.
 */
function StaffDetails({
  id,
  username,
  t,
}: {
  id: string;
  username: string | null;
  t: (k: StringKey) => string;
}) {
  const sendLink = useSendResetLink();
  const [copied, setCopied] = useState(false);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the URL is visible for manual copy anyway.
    }
  }

  return (
    <div className="doc-sub" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div>
        {t("empUsername")}: {username ?? "—"}
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          className="doc-btn"
          onClick={() => {
            setCopied(false);
            sendLink.mutate(id);
          }}
          disabled={sendLink.isPending}
        >
          {sendLink.isPending ? t("resetSending") : t("resetSendLink")}
        </button>
      </div>
      {sendLink.isError && <p className="modal-error">{t("resetLinkFailed")}</p>}
      {sendLink.data && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              readOnly
              value={sendLink.data.resetUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="doc-btn" onClick={() => copy(sendLink.data!.resetUrl)}>
              {copied ? t("resetLinkCopied") : t("resetLinkCopy")}
            </button>
          </div>
          <small>
            {sendLink.data.emailed ? t("resetLinkEmailed") : t("resetLinkNotEmailed")} {t("resetLinkExpiry")}
          </small>
        </div>
      )}
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

/** Admin edits an existing staff account: details, role, and an optional password reset. */
function EditUserModal({
  t,
  user,
  onClose,
}: {
  t: (k: StringKey) => string;
  user: EmployeeItem;
  onClose: () => void;
}) {
  const update = useUpdateUser();
  const [fname, setFname] = useState(user.fname);
  const [lname, setLname] = useState(user.lname);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>(user.role);
  const [error, setError] = useState<string | null>(null);

  useScrollLock(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: UpdateUserInput = {
      fname: fname.trim(),
      lname: lname.trim(),
      email: email.trim(),
      role,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(username.trim() ? { username: username.trim() } : {}),
      ...(password ? { password } : {}),
    };
    update.mutate(
      { id: user.id, input },
      {
        onSuccess: onClose,
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
          <h3>{t("editUserTitle")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

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
              {t("editUserNewPassword")}
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder={t("editUserNewPasswordHint")}
                autoComplete="new-password"
              />
            </label>
          </div>
          {error && <p className="modal-error">{error}</p>}
          <button className="btn-calc modal-submit" type="submit" disabled={update.isPending}>
            {update.isPending ? "…" : t("editUserSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}
