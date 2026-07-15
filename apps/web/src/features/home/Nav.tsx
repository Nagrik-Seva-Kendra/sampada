import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { Language } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";
import { PasswordInput } from "../../components/PasswordInput";
import { LoginModal } from "../auth/LoginModal";
import { useChangePassword } from "../profile/useProfile";

// Buy/Sell intentionally omitted — feature dropped from scope.
const NAV_ITEMS: { key: StringKey; to: string }[] = [
  { key: "navHome", to: "/" },
  { key: "navContact", to: "/contact" },
];

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
  const [pwOpen, setPwOpen] = useState(false);

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

  // Admins manage citizen enquiries through the Manage Team / office tools,
  // not the public contact form — so hide that nav link once logged in as admin.
  const visibleNavItems = NAV_ITEMS.filter((item) => !(isAdmin && item.key === "navContact"));

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
        {visibleNavItems.map((item) => (
          <Fragment key={item.to}>
            <Link
              to={item.to}
              activeProps={{ className: "active" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {t(item.key)}
            </Link>
            {/* Guideline sits right after Home, before Contact Us. */}
            {item.key === "navHome" && (
              <Link to="/guideline" activeProps={{ className: "active" }}>
                {t("navGuideline")}
              </Link>
            )}
          </Fragment>
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
                  title={(user.fname + " " + user.lname).trim()}
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
                      to="/team"
                      className={pathname === "/team" ? "active" : ""}
                      onClick={() => setAccountOpen(false)}
                    >
                      {t("navManageTeam")}
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/manage-guideline"
                      className={pathname === "/manage-guideline" ? "active" : ""}
                      onClick={() => setAccountOpen(false)}
                    >
                      {t("navManageGuideline")}
                    </Link>
                  )}
                  <a
                    onClick={() => {
                      setAccountOpen(false);
                      setPwOpen(true);
                    }}
                  >
                    {lang === "hi" ? "पासवर्ड बदलें" : "Change Password"}
                  </a>
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
      {pwOpen && <ChangePasswordModal lang={lang} onClose={() => setPwOpen(false)} />}
    </nav>
  );
}

/** Self-service change-password modal — available to every logged-in account. */
function ChangePasswordModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate({ currentPassword: current, password: next });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{L("Change Password", "पासवर्ड बदलें")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {change.isSuccess ? (
          <div className="modal-form">
            <p className="dr-status-active">✓ {L("Password changed successfully.", "पासवर्ड सफलतापूर्वक बदल गया।")}</p>
            <button type="button" className="btn-calc modal-submit" onClick={onClose}>
              {L("Done", "ठीक है")}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="modal-form">
            <label className="modal-field">
              {L("Current password", "वर्तमान पासवर्ड")}
              <PasswordInput
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="modal-field">
              {L("New password", "नया पासवर्ड")}
              <PasswordInput
                value={next}
                onChange={(e) => setNext(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="modal-field">
              {L("Confirm new password", "नया पासवर्ड दोबारा")}
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            {mismatch && <p className="modal-error">{L("New passwords do not match.", "नए पासवर्ड मेल नहीं खाते।")}</p>}
            {change.isError && <p className="modal-error">{change.error.message}</p>}
            <button className="btn-calc modal-submit" type="submit" disabled={change.isPending}>
              {change.isPending ? "…" : L("Change Password", "पासवर्ड बदलें")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
