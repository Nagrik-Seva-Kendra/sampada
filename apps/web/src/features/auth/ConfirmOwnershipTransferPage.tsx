import { useState } from "react";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useAcceptOwnershipTransfer } from "./useAuth";

/** Public page reached via an ownership-transfer email link: /confirm-ownership-transfer?token=... */
export function ConfirmOwnershipTransferPage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const accept = useAcceptOwnershipTransfer();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [done, setDone] = useState(false);

  function onConfirm() {
    accept.mutate(token, { onSuccess: () => setDone(true) });
  }

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 440 }}>
        <div className="kicker">
          <span className="rule" />
          {t("transferConfirmTitle")}
        </div>
        <h2 className="page-title">{t("transferConfirmTitle")}</h2>

        {!token ? (
          <p className="modal-error">{t("transferConfirmMissingToken")}</p>
        ) : done ? (
          <div className="doc-sub" style={{ marginTop: 12 }}>
            <p>{t("transferConfirmSuccess")}</p>
            <a className="btn-calc" href="/" style={{ marginTop: 12, display: "inline-block" }}>
              {t("authBackToLogin")}
            </a>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p className="doc-sub">{t("transferConfirmPrompt")}</p>
            {accept.isError && <p className="modal-error">{accept.error.message}</p>}
            <button className="btn-calc" onClick={onConfirm} disabled={accept.isPending} style={{ marginTop: 12 }}>
              {accept.isPending ? "…" : t("transferConfirmSubmit")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
