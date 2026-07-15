import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { Nav } from "./features/home/Nav";
import { Hero } from "./features/home/Hero";
import { Services } from "./features/home/Services";
import { OurStory } from "./features/home/OurStory";
import { Testimonials } from "./features/home/Testimonials";
import { FAQ } from "./features/home/FAQ";
import { Footer } from "./features/home/Footer";
import { WhatsAppFab } from "./features/home/WhatsAppFab";
import { CallNowFab } from "./features/home/CallNowFab";
import { TrustBadges } from "./features/home/TrustBadges";
import { DeedsPage } from "./features/deeds/DeedsPage";
import { DeedDetailPage } from "./features/deeds/DeedDetailPage";
import { DeedEditPage } from "./features/deeds/DeedEditPage";
import { AllDeedsPage } from "./features/deeds/AllDeedsPage";
import { AboutPage } from "./features/about/AboutPage";
import { ContactPage } from "./features/contact/ContactPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { TeamPage } from "./features/employees/TeamPage";
import { useAuthStore, useIsStaff } from "./stores/authStore";

const rootRoute = createRootRoute({
  component: () => (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Nav />
      <div style={{ flex: 1 }}>
        <Outlet />
      </div>
      <Footer />
      <WhatsAppFab />
      <CallNowFab />
    </div>
  ),
  notFoundComponent: () => <Navigate to="/" />,
});

function HomePage() {
  return (
    <>
      <Hero />
      <TrustBadges />
      <Services />
      <OurStory />
      <Testimonials />
      <FAQ />
    </>
  );
}

// Deeds are staff-only; public users bounce home (also on logout mid-view).
function GuardedDeedsPage() {
  return useIsStaff() ? <DeedsPage /> : <Navigate to="/" />;
}
function GuardedDeedDetailPage() {
  return useIsStaff() ? <DeedDetailPage /> : <Navigate to="/" />;
}
// Deed drafting: own sample deed, or — for ADMIN/EMPLOYEE — anyone's.
function GuardedDeedEditPage() {
  return useIsStaff() ? <DeedEditPage /> : <Navigate to="/" />;
}
// Self-service profile is employee-only (admin has no self-edit UI).
function GuardedProfilePage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "EMPLOYEE" ? <ProfilePage /> : <Navigate to="/" />;
}
// Team management (signup requests + user directory + add-user) is admin-only.
function GuardedTeamPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <TeamPage /> : <Navigate to="/" />;
}
// "All Deeds" management table (every user's deeds) is admin + employee only.
function GuardedAllDeedsPage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" || role === "EMPLOYEE" ? <AllDeedsPage /> : <Navigate to="/" />;
}

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/team", component: GuardedTeamPage }),
  // Old route — superseded by the tabbed /team page.
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/employee-requests",
    component: () => <Navigate to="/team" />,
  }),
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
  createRoute({ getParentRoute: () => rootRoute, path: "/contact", component: ContactPage }),
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
