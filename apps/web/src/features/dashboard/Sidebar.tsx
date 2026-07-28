import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hasPermission } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization, useAuthStore, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { CreateDeedMenu } from "../deeds/CreateDeedMenu";
import { matchApp } from "./appsRegistry";

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

/** Left nav for the authenticated app shell — shows whichever app's pages match the current route. Collapsible via the edge arrow. */
export function Sidebar() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const isStaff = useIsStaff();
  const activeOrganization = useActiveOrganization();
  const user = useAuthStore((s) => s.user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const canManageTeam = !!activeOrganization && hasPermission(activeOrganization.role, "members.invite");
  const ctx = { isStaff, isPlatformAdmin: !!user?.isPlatformAdmin, canManageTeam };
  const activeApp = matchApp(pathname);
  const navItems = activeApp.navItems.filter((i) => !i.visible || i.visible(ctx));

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="sidebar-top">
        {!collapsed && (
          <div className="sidebar-app-heading">
            <div className="sidebar-app-name">{t(activeApp.labelKey)}</div>
            <div className="sidebar-app-desc">{t(activeApp.descriptionKey)}</div>
          </div>
        )}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
        </button>
      </div>

      {activeApp.id === "e-registry" && (
        <div style={{ padding: "0 8px 10px" }}>
          <CreateDeedMenu
            triggerClassName="btn-calc"
            triggerStyle={{ width: "100%", justifyContent: "center" }}
            triggerLabel={collapsed ? "" : undefined}
          />
        </div>
      )}

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            icon={<item.icon size={17} strokeWidth={2.2} />}
            label={t(item.labelKey)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="sidebar-spacer" />
    </aside>
  );
}
