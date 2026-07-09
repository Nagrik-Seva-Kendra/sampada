import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  useApprovePartner,
  useDeactivatePartner,
  usePartnerPassword,
  usePartners,
  usePendingPartners,
  useReactivatePartner,
  useRejectPartner,
} from "./usePartners";

/** Admin only: approve or reject pending partner self-signups; browse/discontinue already-approved partners. */
export function PartnerRequestsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const pending = usePendingPartners();
  const active = usePartners();
  const approve = useApprovePartner();
  const reject = useRejectPartner();
  const deactivate = useDeactivatePartner();
  const reactivate = useReactivatePartner();
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
          {t("navPartnerRequests")}
        </div>
        <h2 className="page-title">{t("navPartnerRequests")}</h2>

        {(approve.isError || reject.isError || deactivate.isError || reactivate.isError) && (
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

        <h3 className="er-section">{t("reqActivePartners")}</h3>
        {(active.data ?? []).length === 0 && !active.isLoading && (
          <p className="doc-empty">{t("reqActiveEmpty")}</p>
        )}
        <div className="doc-list" style={{ marginTop: 16 }}>
          {(active.data ?? []).map((p) => (
            <div className="doc" key={p.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="doc-meta">
                  <div className="doc-name">
                    {p.fname} {p.lname}
                    <span
                      className={p.status === "ACTIVE" ? "dr-status-active" : "modal-error"}
                      style={{ marginLeft: 8 }}
                    >
                      {t(p.status === "ACTIVE" ? "reqStatusActive" : "reqStatusInactive")}
                    </span>
                  </div>
                  <div className="doc-sub">
                    {p.email} · {p.phone}
                  </div>
                </div>
                <div className="doc-actions">
                  <button
                    className="doc-btn"
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  >
                    {expandedId === p.id ? t("empHideDetails") : t("empViewDetails")}
                  </button>
                  {p.status === "ACTIVE" ? (
                    <button
                      className="doc-btn danger"
                      onClick={() => onDeactivate(p.id)}
                      disabled={deactivate.isPending}
                    >
                      {t("reqDiscontinue")}
                    </button>
                  ) : (
                    <button
                      className="doc-btn"
                      onClick={() => reactivate.mutate(p.id)}
                      disabled={reactivate.isPending}
                    >
                      {t("reqReactivate")}
                    </button>
                  )}
                </div>
              </div>
              {expandedId === p.id && <PartnerDetails id={p.id} username={p.username} t={t} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerDetails({
  id,
  username,
  t,
}: {
  id: string;
  username: string | null;
  t: (k: StringKey) => string;
}) {
  const reveal = usePartnerPassword();

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
