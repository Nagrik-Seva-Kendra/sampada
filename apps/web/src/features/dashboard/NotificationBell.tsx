import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bell } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useIsStaff } from "../../stores/authStore";
import { usePendingCorrections } from "../deeds/useSampleDeeds";

const MENU_WIDTH = 320;

function timeAgo(iso: string, lang: "en" | "hi"): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return lang === "hi" ? "abhi" : "just now";
  if (mins < 60) return lang === "hi" ? `${mins} min pehle` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "hi" ? `${hours} ghante pehle` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === "hi" ? `${days} din pehle` : `${days}d ago`;
}

/**
 * Sidebar bell: every pending party-flagged correction across the org, so
 * admin/employee notice without opening each deed individually. Same
 * fixed-position popover technique as WorkspaceSwitcher, for the same
 * reason -- the sidebar clips anything wider than itself.
 */
export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const isStaff = useIsStaff();
  const lang = useUiStore((s) => s.lang);
  const pending = usePendingCorrections();

  const [open, setOpen] = useState(false);
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

  if (!isStaff) return null;

  const items = pending.data ?? [];
  const count = items.length;

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        left: Math.round(Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12)),
        top: Math.round(rect.bottom + 6),
        width: MENU_WIDTH,
      });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className="notif-bell-trigger"
        onClick={toggleOpen}
        aria-expanded={open}
        title={lang === "hi" ? "Corrections" : "Corrections"}
      >
        <Bell size={17} strokeWidth={2.2} />
        {count > 0 && <span className="notif-bell-badge">{count > 9 ? "9+" : count}</span>}
      </button>

      {open && menuStyle && (
        <div className="notif-bell-menu" role="menu" style={menuStyle}>
          <div className="notif-bell-heading">
            {lang === "hi" ? "Party corrections" : "Party corrections"}
          </div>
          {items.length === 0 && (
            <div className="notif-bell-empty">
              {lang === "hi" ? "Koi pending correction nahi hai." : "No pending corrections."}
            </div>
          )}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="notif-bell-item"
              onClick={() => {
                setOpen(false);
                window.open(`/deeds/${c.deedType}/edit/${c.deedId}`, "_blank");
              }}
            >
              <div className="notif-bell-item-title">{c.deedTitle}</div>
              <div className="notif-bell-item-msg">{c.message}</div>
              <div className="notif-bell-item-time">{timeAgo(c.createdAt, lang)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
