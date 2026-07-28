import type { ComponentType } from "react";
import { BookOpen, Building2, FileStack, Home, Settings, Users } from "lucide-react";
import type { StringKey } from "../../i18n/strings";

export interface AppVisibilityCtx {
  isStaff: boolean;
  isPlatformAdmin: boolean;
  canManageTeam: boolean;
}

export interface AppNavItem {
  to: string;
  labelKey: StringKey;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  visible?: (ctx: AppVisibilityCtx) => boolean;
}

export interface AppEntry {
  id: string;
  labelKey: StringKey;
  descriptionKey: StringKey;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Route prefix — also used to decide which app's sidebar to show for the current path. */
  path: string;
  section: "pinned" | "all";
  visible?: (ctx: AppVisibilityCtx) => boolean;
  navItems: AppNavItem[];
}

/**
 * Single source of truth for the ERP shell: drives the header's "Apps"
 * launcher dropdown AND which app's nav list the sidebar renders (matched by
 * longest `path` prefix against the current route, see Sidebar.tsx).
 */
export const APPS_REGISTRY: AppEntry[] = [
  {
    id: "e-registry",
    labelKey: "appEregistryName",
    descriptionKey: "appEregistryDesc",
    icon: FileStack,
    path: "/deeds",
    section: "pinned",
    navItems: [
      { to: "/deeds", labelKey: "sidebarAllDeeds", icon: FileStack },
      { to: "/guideline", labelKey: "sidebarGuideline", icon: BookOpen, visible: (ctx) => ctx.isStaff },
      { to: "/team", labelKey: "sidebarTeam", icon: Users, visible: (ctx) => ctx.canManageTeam },
      { to: "/settings", labelKey: "sidebarSettings", icon: Settings },
    ],
  },
  {
    id: "platform",
    labelKey: "appPlatformName",
    descriptionKey: "appPlatformDesc",
    icon: Building2,
    path: "/platform",
    section: "pinned",
    visible: (ctx) => ctx.isPlatformAdmin,
    navItems: [{ to: "/platform/organizations", labelKey: "sidebarPlatformOrganizations", icon: Building2 }],
  },
  {
    id: "properties",
    labelKey: "appPropertiesName",
    descriptionKey: "appPropertiesDesc",
    icon: Home,
    path: "/properties",
    section: "all",
    visible: (ctx) => ctx.isStaff,
    navItems: [
      { to: "/properties", labelKey: "sidebarPropertiesAll", icon: Home },
      { to: "/properties/new", labelKey: "sidebarPropertiesNew", icon: Home },
    ],
  },
];

const DEFAULT_APP = APPS_REGISTRY[0]!;

/** The app whose `path` is the longest prefix-match of `pathname`; falls back to the first entry. */
export function matchApp(pathname: string): AppEntry {
  const candidates = APPS_REGISTRY.filter((a) => pathname === a.path || pathname.startsWith(a.path + "/"));
  candidates.sort((a, b) => b.path.length - a.path.length);
  return candidates[0] ?? DEFAULT_APP;
}

export function visibleApps(ctx: AppVisibilityCtx): AppEntry[] {
  return APPS_REGISTRY.filter((a) => !a.visible || a.visible(ctx));
}
