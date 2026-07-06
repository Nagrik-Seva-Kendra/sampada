import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { UtilityBar } from "./features/home/UtilityBar";
import { Nav } from "./features/home/Nav";
import { Hero } from "./features/home/Hero";
import { Services } from "./features/home/Services";
import { Footer } from "./features/home/Footer";
import { GuidelinePage } from "./features/guideline/GuidelinePage";
import { DeedsPage } from "./features/deeds/DeedsPage";
import { DeedDetailPage } from "./features/deeds/DeedDetailPage";
import { DeedEditPage } from "./features/deeds/DeedEditPage";
import { MyDeedsPage } from "./features/deeds/MyDeedsPage";
import { EmployeeDeedsPage } from "./features/deeds/EmployeeDeedsPage";
import { PartnerDeedsPage } from "./features/deeds/PartnerDeedsPage";
import { DeedRegisterEditPage } from "./features/deeds/DeedRegisterEditPage";
import { AboutPage } from "./features/about/AboutPage";
import { ContactPage } from "./features/contact/ContactPage";
import { PartnerPage } from "./features/partner/PartnerPage";
import { InboxPage } from "./features/contact/InboxPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { CompanyDocsPage } from "./features/company-docs/CompanyDocsPage";
import { EmployeeRequestsPage } from "./features/employees/EmployeeRequestsPage";
import { PartnerRequestsPage } from "./features/partner/PartnerRequestsPage";
import { useAuthStore, useIsStaff } from "./stores/authStore";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <UtilityBar />
      <Nav />
      <Outlet />
      <Footer />
    </>
  ),
  notFoundComponent: () => <Navigate to="/" />,
});

function HomePage() {
  return (
    <>
      <Hero />
      <Services />
    </>
  );
}

// Inbox is admin-only; also kicks back to home when the admin logs out mid-view.
function GuardedInboxPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <InboxPage /> : <Navigate to="/" />;
}

// Deeds are partner/admin-only; public users bounce home (also on logout mid-view).
function GuardedDeedsPage() {
  return useIsStaff() ? <DeedsPage /> : <Navigate to="/" />;
}
function GuardedDeedDetailPage() {
  return useIsStaff() ? <DeedDetailPage /> : <Navigate to="/" />;
}
// Deed drafting: own sample deed, or — for ADMIN — anyone's.
function GuardedDeedEditPage() {
  return useIsStaff() ? <DeedEditPage /> : <Navigate to="/" />;
}
function GuardedMyDeedsPage() {
  return useIsStaff() ? <MyDeedsPage /> : <Navigate to="/" />;
}
// Deed-register editing is staff-only (own deed, or — for ADMIN — a partner's).
function GuardedDeedRegisterEditPage() {
  return useIsStaff() ? <DeedRegisterEditPage /> : <Navigate to="/" />;
}
// Partner deeds overview is admin-only.
function GuardedPartnerDeedsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <PartnerDeedsPage /> : <Navigate to="/" />;
}
// Self-service profile is partner/employee-only (admin stays on env credentials).
function GuardedProfilePage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "PARTNER" || role === "EMPLOYEE" ? <ProfilePage /> : <Navigate to="/" />;
}
// Company documents (per-site filing) is admin-only.
function GuardedCompanyDocsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <CompanyDocsPage /> : <Navigate to="/" />;
}
// Employee signup approval queue is admin-only.
function GuardedEmployeeRequestsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <EmployeeRequestsPage /> : <Navigate to="/" />;
}
// Partner signup approval queue is admin-only.
function GuardedPartnerRequestsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <PartnerRequestsPage /> : <Navigate to="/" />;
}
// All-deeds overview (view/edit/create/print everything, never delete) is employee-only.
function GuardedEmployeeDeedsPage() {
  const isEmployee = useAuthStore((s) => s.user?.role === "EMPLOYEE");
  return isEmployee ? <EmployeeDeedsPage /> : <Navigate to="/" />;
}

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/guideline", component: GuidelinePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/my-deeds", component: GuardedMyDeedsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/my-deeds/edit/$id",
    component: GuardedDeedRegisterEditPage,
    validateSearch: (search: Record<string, unknown>): { creatorId: string } => ({
      creatorId: typeof search.creatorId === "string" ? search.creatorId : "",
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/partner-deeds", component: GuardedPartnerDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/company-docs", component: GuardedCompanyDocsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/employee-requests", component: GuardedEmployeeRequestsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/partner-requests", component: GuardedPartnerRequestsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/all-deeds", component: GuardedEmployeeDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/profile", component: GuardedProfilePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds", component: GuardedDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds/$slug", component: GuardedDeedDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds/$slug/edit/$id", component: GuardedDeedEditPage }),
  // Old e-Registry URL — feature replaced by the Deeds section.
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/eregistry",
    component: () => <Navigate to="/deeds" />,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/about", component: AboutPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/contact", component: ContactPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/partner", component: PartnerPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/inbox", component: GuardedInboxPage }),
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
