import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";
import { Sidebar } from "./Sidebar";
import { InstallAppPrompt } from "./InstallAppPrompt";

/** Shell for every authenticated app route: top header + per-app sidebar + content. */
export function DashboardLayout() {
  const token = useAuthStore((s) => s.token);
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [navOpen, setNavOpen] = useState(false);

  // Navigating is the signal that the drawer has done its job.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // A drawer over a scrolling page is disorienting on a phone.
  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  if (!token) return <Navigate to="/login" />;

  return (
    <div className="dashboard-shell">
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setNavOpen(true)}
          aria-label={t("sidebarAllDeeds")}
          aria-expanded={navOpen}
        >
          <Menu size={20} strokeWidth={2.2} />
        </button>
        <Link to="/" className="mobile-topbar-brand">
          <BrandMark />
          <span>{t("brandName")}</span>
        </Link>
      </header>

      {navOpen && (
        <div className="mobile-nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      <Sidebar mobileOpen={navOpen} onCloseMobile={() => setNavOpen(false)} />

      <div className="sidebar-content">
        <InstallAppPrompt />
        <Outlet />
      </div>
    </div>
  );
}
