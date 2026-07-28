import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from "@tanstack/react-router";
import { hasPermission } from "@sampada/shared";
import { ThemeToggle } from "./components/ThemeToggle";
import { LangToggle } from "./components/LangToggle";
import { NotificationBell } from "./features/dashboard/NotificationBell";
import { DeedEditPage } from "./features/deeds/DeedEditPage";
import { AllDeedsPage } from "./features/deeds/AllDeedsPage";
import { PublicDeedViewPage } from "./features/deeds/PublicDeedViewPage";
import { TeamPage } from "./features/employees/TeamPage";
import { GuidelinePage } from "./features/guideline/GuidelinePage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { LoginPage } from "./features/auth/LoginPage";
import { AcceptInvitePage } from "./features/auth/AcceptInvitePage";
import { ConfirmOwnershipTransferPage } from "./features/auth/ConfirmOwnershipTransferPage";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";
import { DashboardLayout } from "./features/dashboard/DashboardLayout";
import { SettingsPage } from "./features/dashboard/SettingsPage";
import { WelcomePage } from "./features/dashboard/WelcomePage";
import { PlatformOrganizationsPage } from "./features/platform/PlatformOrganizationsPage";
import { PlatformOrganizationDetailPage } from "./features/platform/PlatformOrganizationDetailPage";
import { PropertiesListPage } from "./features/properties/PropertiesListPage";
import { PropertyFormPage } from "./features/properties/PropertyFormPage";
import { useActiveOrganization, useAuthStore, useIsStaff } from "./stores/authStore";

function TopControls() {
  // The bell only means anything once there's a session behind it.
  const token = useAuthStore((s) => s.token);
  return (
    <div className="top-controls-fab">
      <LangToggle />
      <ThemeToggle />
      {token && <NotificationBell />}
    </div>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <TopControls />
      <Outlet />
    </>
  ),
  notFoundComponent: () => <Navigate to="/" />,
});

// Deed drafting: own sample deed, or, for ADMIN/EMPLOYEE, anyone's. Full-page
// editor, deliberately outside the dashboard shell (focused, chromeless).
function GuardedDeedEditPage() {
  return useIsStaff() ? <DeedEditPage /> : <Navigate to="/login" />;
}

const deedEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deeds/$slug/edit/$id",
  component: GuardedDeedEditPage,
});

// Party-facing share link: no auth, keyed by the deed's own id.
const publicDeedViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/d/$id",
  component: PublicDeedViewPage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
});
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage });
// Old org-signup URL — onboarding replaces it (every signup gets a personal workspace by default now).
const signupRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: () => <Navigate to="/onboarding" />,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});
const acceptInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invite",
  component: AcceptInvitePage,
});
const confirmOwnershipTransferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/confirm-ownership-transfer",
  component: ConfirmOwnershipTransferPage,
});
// One-time post-login splash (greeting + this org's deed stats), shown right
// after login/onboarding/accepting an invite -- deliberately outside the
// dashboard shell so it's a full-screen moment, not a page with a sidebar.
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/welcome",
  component: WelcomePage,
});

// ---------------------------------------------------------------------------
// Authenticated app shell: sidebar + content, no header/footer. Every route
// below is a dashboard "page" — the deed editor above is deliberately outside
// this tree so it can be a focused, full-screen view.
// ---------------------------------------------------------------------------
const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "dashboard",
  component: DashboardLayout,
});

function GuardedAllDeedsPage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" || role === "EMPLOYEE" ? <AllDeedsPage /> : <Navigate to="/deeds" />;
}
function GuardedGuidelinePage() {
  return useIsStaff() ? <GuidelinePage /> : <Navigate to="/deeds" />;
}
// Team management is gated by ORG role (members.invite+), not the global login tier —
// a user can be an OWNER of one org and a plain EMPLOYEE of another.
function GuardedTeamPage() {
  const activeOrganization = useActiveOrganization();
  const canManageTeam = !!activeOrganization && hasPermission(activeOrganization.role, "members.invite");
  return canManageTeam ? <TeamPage /> : <Navigate to="/deeds" />;
}

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/",
  component: () => <Navigate to="/deeds" />,
});
const allDeedsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/deeds",
  component: GuardedAllDeedsPage,
});
// Old routes, superseded by the dashboard's /deeds home.
const allDeedDetailsRedirectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/all-deed-details",
  component: () => <Navigate to="/deeds" />,
});
const deedTypePickerRedirectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/deeds/$slug",
  component: () => <Navigate to="/deeds" />,
});
const teamRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/team",
  component: GuardedTeamPage,
});
// Old route, superseded by the tabbed /team page.
const employeeRequestsRedirectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/employee-requests",
  component: () => <Navigate to="/team" />,
});
const guidelineRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/guideline",
  component: GuardedGuidelinePage,
});
const settingsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/settings",
  component: SettingsPage,
});
// Old route, superseded by /settings (now open to every org role, not just employees).
const profileRedirectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/profile",
  component: () => <Navigate to="/settings" />,
});

// Platform back-office ("Sampada management" app) — platform-admin only,
// spans every organization, independent of the caller's own org/role.
function GuardedPlatformOrganizationsPage() {
  const isPlatformAdmin = useAuthStore((s) => !!s.user?.isPlatformAdmin);
  return isPlatformAdmin ? <PlatformOrganizationsPage /> : <Navigate to="/deeds" />;
}
function GuardedPlatformOrganizationDetailPage() {
  const isPlatformAdmin = useAuthStore((s) => !!s.user?.isPlatformAdmin);
  return isPlatformAdmin ? <PlatformOrganizationDetailPage /> : <Navigate to="/deeds" />;
}
const platformOrganizationsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/platform/organizations",
  component: GuardedPlatformOrganizationsPage,
});
const platformOrganizationDetailRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/platform/organizations/$id",
  component: GuardedPlatformOrganizationDetailPage,
});

// Property upload app — any staff login (EMPLOYEE/ADMIN), feeds the public property site.
function GuardedPropertiesListPage() {
  return useIsStaff() ? <PropertiesListPage /> : <Navigate to="/deeds" />;
}
function GuardedPropertyCreatePage() {
  return useIsStaff() ? <PropertyFormPage mode="create" /> : <Navigate to="/deeds" />;
}
function GuardedPropertyEditPage() {
  return useIsStaff() ? <PropertyFormPage mode="edit" /> : <Navigate to="/deeds" />;
}
const propertiesListRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/properties",
  component: GuardedPropertiesListPage,
});
const propertyCreateRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/properties/new",
  component: GuardedPropertyCreatePage,
});
const propertyEditRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/properties/$id/edit",
  component: GuardedPropertyEditPage,
});

const dashboardRoute = dashboardLayoutRoute.addChildren([
  dashboardIndexRoute,
  allDeedsRoute,
  allDeedDetailsRedirectRoute,
  deedTypePickerRedirectRoute,
  teamRoute,
  employeeRequestsRedirectRoute,
  guidelineRoute,
  settingsRoute,
  profileRedirectRoute,
  platformOrganizationsRoute,
  platformOrganizationDetailRoute,
  propertiesListRoute,
  propertyCreateRoute,
  propertyEditRoute,
]);

const routes = [
  deedEditRoute,
  publicDeedViewRoute,
  onboardingRoute,
  loginRoute,
  signupRedirectRoute,
  resetPasswordRoute,
  acceptInviteRoute,
  confirmOwnershipTransferRoute,
  welcomeRoute,
  dashboardRoute,
];

export const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
