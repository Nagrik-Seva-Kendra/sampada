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
import { DeedsPage } from "./features/deeds/DeedsPage";
import { DeedDetailPage } from "./features/deeds/DeedDetailPage";
import { DeedEditPage } from "./features/deeds/DeedEditPage";
import { EmployeeDeedsPage } from "./features/deeds/EmployeeDeedsPage";
import { PartnerDeedsPage } from "./features/deeds/PartnerDeedsPage";
import { AllDeedsPage } from "./features/deeds/AllDeedsPage";
import { AboutPage } from "./features/about/AboutPage";
import { PartnerPage } from "./features/partner/PartnerPage";
import { ProfilePage } from "./features/profile/ProfilePage";
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
// "All Deeds" management table (every user's deeds) is admin + employee only.
function GuardedAllDeedsPage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" || role === "EMPLOYEE" ? <AllDeedsPage /> : <Navigate to="/" />;
}

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/partner-deeds", component: GuardedPartnerDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/employee-requests", component: GuardedEmployeeRequestsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/partner-requests", component: GuardedPartnerRequestsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/all-deeds", component: GuardedEmployeeDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/all-deed-details", component: GuardedAllDeedsPage }),
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
  createRoute({ getParentRoute: () => rootRoute, path: "/partner", component: PartnerPage }),
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
