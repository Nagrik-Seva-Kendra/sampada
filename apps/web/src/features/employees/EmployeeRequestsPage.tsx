import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  useApproveEmployee,
  useDeactivateEmployee,
  useEmployeePassword,
  useEmployeesList,
  usePendingEmployees,
  useReactivateEmployee,
  useRejectEmployee,
} from "./useEmployees";

/** Admin only: approve or reject pending employee self-signups; browse/discontinue already-approved employees. */
export function EmployeeRequestsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const pending = usePendingEmployees();
  const active = useEmployeesList();
  const approve = useApproveEmployee();
  const reject = useRejectEmployee();
  const deactivate = useDeactivateEmployee();
  const reactivate = useReactivateEmployee();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function onReject(id: string) {
    if (window.confirm(t("reqRejectConfirm"))) reject.mutate(id);
  }

  function onDeactivate(id: string) {
    if (window.confirm(t("reqDiscontinueConfirm"))) deactivate.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navEmployeeRequests")}
        </div>
        <h2 className="page-title">{t("navEmployeeRequests")}</h2>

        {(approve.isError || reject.isError || deactivate.isError || reactivate.isError) && (
          <p className="modal-error">{t("reqActionFailed")}</p>
        )}

        {(pending.data ?? []).length === 0 && !pending.isLoading && (
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
                  <button
                    className="doc-btn"
                    onClick={() => approve.mutate(req.id)}
                    disabled={approve.isPending}
                  >
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
              {expandedId === req.id && <EmployeeDetails id={req.id} username={req.username} t={t} />}
            </div>
          ))}
        </div>

        <h3 className="er-section">{t("reqActiveEmployees")}</h3>
        {(active.data ?? []).length === 0 && !active.isLoading && (
          <p className="doc-empty">{t("reqActiveEmpty")}</p>
        )}
        <div className="doc-list" style={{ marginTop: 16 }}>
          {(active.data ?? []).map((emp) => (
            <div className="doc" key={emp.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="doc-meta">
                  <div className="doc-name">
                    {emp.fname} {emp.lname}
                    {emp.employeeCode && (
                      <span className="doc-sub" style={{ marginLeft: 8 }}>
                        [{emp.employeeCode}]
                      </span>
                    )}
                    <span
                      className={emp.status === "ACTIVE" ? "dr-status-active" : "modal-error"}
                      style={{ marginLeft: 8 }}
                    >
                      {t(emp.status === "ACTIVE" ? "reqStatusActive" : "reqStatusInactive")}
                    </span>
                  </div>
                  <div className="doc-sub">
                    {emp.email} · {emp.phone}
                  </div>
                </div>
                <div className="doc-actions">
                  <button
                    className="doc-btn"
                    onClick={() => setExpandedId(expandedId === emp.id ? null : emp.id)}
                  >
                    {expandedId === emp.id ? t("empHideDetails") : t("empViewDetails")}
                  </button>
                  {emp.status === "ACTIVE" ? (
                    <button
                      className="doc-btn danger"
                      onClick={() => onDeactivate(emp.id)}
                      disabled={deactivate.isPending}
                    >
                      {t("reqDiscontinue")}
                    </button>
                  ) : (
                    <button
                      className="doc-btn"
                      onClick={() => reactivate.mutate(emp.id)}
                      disabled={reactivate.isPending}
                    >
                      {t("reqReactivate")}
                    </button>
                  )}
                </div>
              </div>
              {expandedId === emp.id && <EmployeeDetails id={emp.id} username={emp.username} t={t} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmployeeDetails({
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
