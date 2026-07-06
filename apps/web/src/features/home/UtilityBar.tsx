import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Language } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate } from "../../i18n/strings";
import { LoginModal } from "../auth/LoginModal";

export function UtilityBar() {
  const { theme, lang, toggleTheme, setLang } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const t = (k: Parameters<typeof translate>[0]) => translate(k, lang);

  const [loginOpen, setLoginOpen] = useState(false);
  const langs: Language[] = ["en", "hi"];

  return (
    <div className="util">
      <div className="wrap">
        <div className="left">
          <span>{t("phone")}</span>
          <span>{t("email")}</span>
        </div>
        <div className="right">
          <div className="seg" role="group" aria-label="Language">
            {langs.map((l) => (
              <button
                key={l}
                className={lang === l ? "on" : ""}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
              >
                {l === "en" ? "EN" : "हिं"}
              </button>
            ))}
          </div>
          <button className="toggle" onClick={toggleTheme} aria-label="Toggle theme">
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            <span>{theme === "dark" ? t("light") : t("dark")}</span>
          </button>

          {user ? (
            <span className="util-auth">
              <span className="util-user" title={user.email}>
                {user.fname} {user.lname}
              </span>
              {(user.role === "PARTNER" || user.role === "EMPLOYEE") && (
                <Link to="/profile">{t("navProfile")}</Link>
              )}
              {user.role === "ADMIN" && <Link to="/inbox">{t("inboxLink")}</Link>}
              <a onClick={logout}>{t("authLogout")}</a>
            </span>
          ) : (
            <a onClick={() => setLoginOpen(true)}>{t("login")}</a>
          )}
        </div>
      </div>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
