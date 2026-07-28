import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, FileStack, Settings, Users, X } from "lucide-react";
import { hasPermission } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization, useAuthStore, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";
import { CreateDeedMenu } from "../deeds/CreateDeedMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const COLLAPSE_KEY = "nsk-sidebar-collapsed";

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const on = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link to={to} className={"sidebar-link" + (on ? " on" : "")} title={collapsed ? label : undefined}>
      {icon}
      {!collapsed && label}
    </Link>
  );
}

/**
 * Left nav for the authenticated app shell: deeds, workspace tools, settings.
 * Collapsible via the edge arrow on desktop; slides in as a drawer on mobile.
 */
export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const isStaff = useIsStaff();
  const activeOrganization = useActiveOrganization();
  const user = useAuthStore((s) => s.user);

  const [collapsedPref, setCollapsedPref] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsedPref ? "1" : "0");
  }, [collapsedPref]);

  // The drawer is the only nav on mobile, so it always shows labels — a
  // collapsed preference set on desktop would otherwise leave bare icons.
  const collapsed = mobileOpen ? false : collapsedPref;

  const canManageTeam = !!activeOrganization && hasPermission(activeOrganization.role, "members.invite");

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "") + (mobileOpen ? " mobile-open" : "")}>
      <div className="sidebar-top">
        <Link to="/" className="sidebar-brand" title={collapsed ? t("brandName") : undefined}>
          <BrandMark />
          {!collapsed && <span className="sidebar-brand-text">{t("brandName")}</span>}
        </Link>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setCollapsedPref((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onCloseMobile}
          aria-label="Close menu"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>
      <div style={{ padding: "0 8px 10px" }}>
        <CreateDeedMenu
          triggerClassName="btn-calc"
          triggerStyle={{ width: "100%", justifyContent: "center" }}
          triggerLabel={collapsed ? "" : undefined}
        />
      </div>

      <nav className="sidebar-nav">
        <SidebarLink
          to="/deeds"
          icon={<FileStack size={17} strokeWidth={2.2} />}
          label={t("sidebarAllDeeds")}
          collapsed={collapsed}
        />
        {isStaff && (
          <SidebarLink
            to="/guideline"
            icon={<BookOpen size={17} strokeWidth={2.2} />}
            label={t("sidebarGuideline")}
            collapsed={collapsed}
          />
        )}
        {canManageTeam && (
          <SidebarLink
            to="/team"
            icon={<Users size={17} strokeWidth={2.2} />}
            label={t("sidebarTeam")}
            collapsed={collapsed}
          />
        )}
        <SidebarLink
          to="/settings"
          icon={<Settings size={17} strokeWidth={2.2} />}
          label={t("sidebarSettings")}
          collapsed={collapsed}
        />
      </nav>

      <div className="sidebar-spacer" />

      {user && <WorkspaceSwitcher collapsed={collapsed} />}
    </aside>
  );
}
