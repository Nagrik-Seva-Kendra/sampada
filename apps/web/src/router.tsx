import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { hasPermission } from "@sampada/shared";
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
import { useActiveOrganization, useAuthStore, useIsStaff } from "./stores/authStore";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
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
