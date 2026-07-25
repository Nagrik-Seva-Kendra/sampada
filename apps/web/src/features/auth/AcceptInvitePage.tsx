import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { useAcceptInvite } from "./useAuth";

/** Public page reached via an email invite link: /accept-invite?token=... */
export function AcceptInvitePage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const navigate = useNavigate();
  const accept = useAcceptInvite();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    accept.mutate(
      {
        token,
        fname: fname.trim(),
        lname: lname.trim(),
        username: username.trim() || undefined,
        password,
      },
      { onSuccess: () => navigate({ to: "/" }) },
    );
  }

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 440 }}>
        <div className="kicker">
          <span className="rule" />
          {t("authAcceptInviteTitle")}
        </div>
        <h2 className="page-title">{t("authAcceptInviteTitle")}</h2>

        {!token ? (
          <p className="modal-error">{t("authAcceptInviteMissingToken")}</p>
        ) : (
          <form onSubmit={onSubmit} className="modal-form" style={{ marginTop: 12 }}>
            <label className="modal-field">
              {t("profileFname")}
              <input value={fname} onChange={(e) => setFname(e.target.value)} required maxLength={100} autoFocus />
            </label>
            <label className="modal-field">
              {t("profileLname")}
              <input value={lname} onChange={(e) => setLname(e.target.value)} required maxLength={100} />
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
              {t("authPassword")}
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            {accept.isError && <p className="modal-error">{accept.error.message}</p>}
            <button className="btn-calc modal-submit" type="submit" disabled={accept.isPending}>
              {accept.isPending ? "…" : t("authAcceptInviteSubmit")}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
