import { Link, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { hasPermission } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization, useAuthStore, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LangToggle } from "../../components/LangToggle";
import { NotificationBell } from "./NotificationBell";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { AppsLauncher } from "./AppsLauncher";
import { matchApp } from "./appsRegistry";

/** Top global header for the authenticated app shell: brand, Apps launcher, breadcrumb, search, and account controls. */
export function TopHeader() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const isStaff = useIsStaff();
  const activeOrganization = useActiveOrganization();
  const user = useAuthStore((s) => s.user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const canManageTeam = !!activeOrganization && hasPermission(activeOrganization.role, "members.invite");
  const ctx = { isStaff, isPlatformAdmin: !!user?.isPlatformAdmin, canManageTeam };
  const activeApp = matchApp(pathname);
  const activePage = [...activeApp.navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => pathname === i.to || pathname.startsWith(i.to + "/"));

  return (
    <header className="top-header">
      <div className="th-left">
        <Link to="/" className="th-brand">
          <BrandMark />
          <span className="th-brand-text">{t("brandName")}</span>
        </Link>
        <AppsLauncher ctx={ctx} activeAppId={activeApp.id} />
        <div className="th-breadcrumb">
          <span>{t(activeApp.labelKey)}</span>
          {activePage && (
            <>
              <span className="th-breadcrumb-sep">/</span>
              <span>{t(activePage.labelKey)}</span>
            </>
          )}
        </div>
      </div>
      <div className="th-right">
        <div className="th-search">
          <Search size={15} strokeWidth={2.2} />
          <input type="text" placeholder={t("headerSearchPlaceholder")} disabled />
        </div>
        <LangToggle />
        <ThemeToggle />
        {isStaff && <NotificationBell />}
        {user && <WorkspaceSwitcher />}
      </div>
    </header>
  );
}
