import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useApprovePartner, usePendingPartners, useRejectPartner } from "../deeds/useDeedRegister";

/** Admin only: approve or reject pending partner self-signups. */
export function PartnerRequestsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const pending = usePendingPartners();
  const approve = useApprovePartner();
  const reject = useRejectPartner();

  function onReject(id: string) {
    if (window.confirm(t("reqRejectConfirm"))) reject.mutate(id);
  }

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navPartnerRequests")}
        </div>
        <h2 className="page-title">{t("navPartnerRequests")}</h2>

        {(approve.isError || reject.isError) && (
          <p className="modal-error">{t("reqActionFailed")}</p>
        )}

        {(pending.data ?? []).length === 0 && !pending.isLoading && (
          <p className="doc-empty">{t("partReqEmpty")}</p>
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
