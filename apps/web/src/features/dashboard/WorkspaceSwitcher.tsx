import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronsUpDown, LogOut, Plus } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization, useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useMyOrganizations, useSwitchOrganization } from "../auth/useAuth";
import { CreateOrganizationModal } from "./CreateOrganizationModal";

const MENU_WIDTH = 232;

/** Bottom-of-sidebar account menu: current workspace, switcher, create-org, logout. */
export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const activeOrganization = useActiveOrganization();
  const orgs = useMyOrganizations();
  const switchOrg = useSwitchOrganization();

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // The sidebar (and its collapsed rail) clips anything wider than itself via
  // overflow, so the popover is positioned in fixed/viewport coordinates —
  // computed from the trigger's rect — instead of relying on CSS absolute
  // positioning inside an ancestor that clips it.
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        left: Math.round(rect.left),
        bottom: Math.round(window.innerHeight - rect.top + 6),
        width: MENU_WIDTH,
      });
    }
    setOpen((o) => !o);
  }

  if (!user) return null;
  const initial = (activeOrganization?.name ?? user.fname).trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="ws-switcher" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className="ws-switcher-trigger"
        onClick={toggleOpen}
        aria-expanded={open}
        title={collapsed ? (activeOrganization?.name ?? `${user.fname} ${user.lname}`) : undefined}
      >
        <span className="ws-switcher-avatar">{initial}</span>
        {!collapsed && (
          <>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ws-switcher-name">{activeOrganization?.name ?? `${user.fname} ${user.lname}`}</span>
              <br />
              <span className="ws-switcher-role">{activeOrganization?.role}</span>
            </span>
            <ChevronsUpDown size={15} strokeWidth={2} style={{ opacity: 0.6, flexShrink: 0 }} />
          </>
        )}
      </button>

      {open && menuStyle && (
        <div className="ws-switcher-menu" role="menu" style={menuStyle}>
          {(orgs.data ?? []).map((org) => (
            <button
              key={org.id}
              type="button"
              className={"ws-switcher-item" + (org.id === activeOrganization?.id ? " on" : "")}
              onClick={() => {
                setOpen(false);
                if (org.id !== activeOrganization?.id) switchOrg.mutate(org.id);
              }}
            >
              <span className="ws-switcher-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
                {org.name.charAt(0).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {org.name}
              </span>
            </button>
          ))}

          <div className="ws-switcher-divider" />

          <button
            type="button"
            className="ws-switcher-item"
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
          >
            <Plus size={15} strokeWidth={2.2} />
            {t("workspaceCreateOrg")}
          </button>
          <button
            type="button"
            className="ws-switcher-item"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut size={15} strokeWidth={2.2} />
            {t("sidebarLogout")}
          </button>
        </div>
      )}

      {createOpen && <CreateOrganizationModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
