import { useEffect, useState } from "react";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useLogin } from "./useAuth";

export function LoginModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: onClose });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{t("authLogin")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <label className="modal-field">
            {t("authEmail")}
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="modal-field">
            {t("authPassword")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {login.isError && <p className="modal-error">{t("authInvalid")}</p>}
          <button className="btn-calc modal-submit" type="submit" disabled={login.isPending}>
            {login.isPending ? "…" : t("authLogin")}
          </button>
        </form>
      </div>
    </div>
  );
}
