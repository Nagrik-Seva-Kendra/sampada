import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useApproveEmployee, usePendingEmployees, useRejectEmployee } from "./useEmployees";

/** Admin only: approve or reject pending employee self-signups. */
export function EmployeeRequestsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const pending = usePendingEmployees();
  const approve = useApproveEmployee();
  const reject = useRejectEmployee();

  function onReject(id: string) {
    if (window.confirm(t("reqRejectConfirm"))) reject.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navEmployeeRequests")}
        </div>
        <h2 className="page-title">{t("navEmployeeRequests")}</h2>

        {(approve.isError || reject.isError) && (
          <p className="modal-error">{t("reqActionFailed")}</p>
        )}

        {(pending.data ?? []).length === 0 && !pending.isLoading && (
          <p className="doc-empty">{t("empReqEmpty")}</p>
        )}

        <div className="doc-list" style={{ marginTop: 16 }}>
          {(pending.data ?? []).map((req) => (
            <div className="doc" key={req.id}>
              <div className="doc-meta">
                <div className="doc-name">
                  {req.fname} {req.lname}
                </div>
                <div className="doc-sub">
                  {req.email} · {req.phone} · {t("reqRequestedOn")}{" "}
                  {new Date(req.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="doc-actions">
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
          ))}
        </div>
      </div>
    </section>
  );
}
