import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "../../stores/uiStore";
import { translate } from "../../i18n/strings";
import { visibleApps, type AppEntry, type AppVisibilityCtx } from "./appsRegistry";

/** Header "Apps" dropdown: every app the current user can see, grouped Pinned / All apps. */
export function AppsLauncher({ ctx, activeAppId }: { ctx: AppVisibilityCtx; activeAppId: string }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: Parameters<typeof translate>[0]) => translate(k, lang);
  const apps = visibleApps(ctx);
  const pinned = apps.filter((a) => a.section === "pinned");
  const rest = apps.filter((a) => a.section === "all");

  function renderItem(app: AppEntry) {
    const Icon = app.icon;
    return (
      <DropdownMenuItem key={app.id} asChild className={app.id === activeAppId ? "on" : undefined}>
        <Link to={app.path}>
          <Icon size={16} strokeWidth={2.2} />
          <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontWeight: 700 }}>{t(app.labelKey)}</span>
            <span style={{ fontSize: 11.5, opacity: 0.7 }}>{t(app.descriptionKey)}</span>
          </span>
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="th-apps-trigger">
          <LayoutGrid size={16} strokeWidth={2.2} />
          {t("headerAppsLabel")}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="th-apps-content">
        {pinned.length > 0 && (
          <>
            <DropdownMenuLabel>{t("headerAppsPinned")}</DropdownMenuLabel>
            {pinned.map(renderItem)}
          </>
        )}
        {rest.length > 0 && (
          <>
            {pinned.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t("headerAppsAll")}</DropdownMenuLabel>
            {rest.map(renderItem)}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
