import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization, useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";

const MENU_WIDTH = 232;

/** Bottom-of-sidebar account menu: current workspace (read-only) + logout. */
export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const activeOrganization = useActiveOrganization();

  const [open, setOpen] = useState(false);
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
  const fullName = `${user.fname} ${user.lname}`.trim();
  const initial = fullName.charAt(0).toUpperCase() || "?";

  return (
    <div className="ws-switcher" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className="ws-switcher-trigger"
        onClick={toggleOpen}
        aria-expanded={open}
        title={collapsed ? fullName : undefined}
      >
        <span className="ws-switcher-avatar">{initial}</span>
        {!collapsed && (
          <>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ws-switcher-name">{fullName}</span>
              <br />
              <span className="ws-switcher-role">
                {activeOrganization ? `${activeOrganization.role} · ${activeOrganization.name}` : null}
              </span>
            </span>
            <ChevronsUpDown size={15} strokeWidth={2} style={{ opacity: 0.6, flexShrink: 0 }} />
          </>
        )}
      </button>

      {open && menuStyle && (
        <div className="ws-switcher-menu" role="menu" style={menuStyle}>
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
    </div>
  );
}
