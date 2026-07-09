import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { Language } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";
import { LoginModal } from "../auth/LoginModal";

// Buy/Sell intentionally omitted — feature dropped from scope.
const NAV_ITEMS: { key: StringKey; to: string }[] = [{ key: "navHome", to: "/" }];
const LANGS: Language[] = ["en", "hi"];

export function Nav() {
  const { theme, lang, toggleTheme, setLang } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = user?.role === "ADMIN";
  const isEmployee = user?.role === "EMPLOYEE";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const t = (k: StringKey) => translate(k, lang);

  const [loginOpen, setLoginOpen] = useState(false);

  // Avatar dropdown (profile/employee-requests/logout) — click-toggled, closes on outside click.
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [accountOpen]);

  const initial = user?.fname?.trim().charAt(0).toUpperCase() || "?";

  return (
    <nav className="nav">
      <div className="wrap">
        <Link to="/" className="brand">
          <BrandMark />
          <div>
            <div className="name">{t("brandName")}</div>
            <div className="sub">{t("brandSub")}</div>
          </div>
        </Link>
        <div className="menu">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "active" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {t(item.key)}
            </Link>
          ))}

          {(isAdmin || isEmployee) && (
            <Link to="/all-deed-details" activeProps={{ className: "active" }}>
              {t("navAllDeedDetails")}
            </Link>
          )}

          <div className="nav-controls">
            <div className="nav-seg" role="group" aria-label="Language">
              {LANGS.map((l) => (
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
            <button className="nav-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            {user ? (
              <div className={"nav-dd" + (accountOpen ? " open" : "")} ref={accountRef}>
                <button
                  type="button"
                  className="avatar"
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  title={`${user.fname} ${user.lname}`.trim()}
                >
                  {initial}
                </button>
                <div className="nav-dd-menu right" role="menu">
                  <span className="nav-dd-user">
                    {user.fname} {user.lname}
                  </span>
                  {isEmployee && (
                    <Link to="/profile" onClick={() => setAccountOpen(false)}>
                      {t("navProfile")}
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/employee-requests"
                      className={pathname === "/employee-requests" ? "active" : ""}
                      onClick={() => setAccountOpen(false)}
                    >
                      {t("navEmployeeRequests")}
                    </Link>
                  )}
                  <a
                    onClick={() => {
                      setAccountOpen(false);
                      logout();
                    }}
                  >
                    {t("authLogout")}
                  </a>
                </div>
              </div>
            ) : (
              <a onClick={() => setLoginOpen(true)}>{t("login")}</a>
            )}
          </div>
        </div>
      </div>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </nav>
  );
}
