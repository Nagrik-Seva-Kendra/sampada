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
import { MyDeedsPage } from "./features/deeds/MyDeedsPage";
import { PartnerDeedsPage } from "./features/deeds/PartnerDeedsPage";
import { AboutPage } from "./features/about/AboutPage";
import { ContactPage } from "./features/contact/ContactPage";
import { PartnerPage } from "./features/partner/PartnerPage";
import { InboxPage } from "./features/contact/InboxPage";
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
  const isAdmin = !!useAuthStore((s) => s.user);
  return isAdmin ? <InboxPage /> : <Navigate to="/" />;
}

// Deeds are partner/admin-only; public users bounce home (also on logout mid-view).
function GuardedDeedsPage() {
  return useIsStaff() ? <DeedsPage /> : <Navigate to="/" />;
}
function GuardedDeedDetailPage() {
  return useIsStaff() ? <DeedDetailPage /> : <Navigate to="/" />;
}
function GuardedMyDeedsPage() {
  return useIsStaff() ? <MyDeedsPage /> : <Navigate to="/" />;
}
// Partner deeds overview is admin-only.
function GuardedPartnerDeedsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return isAdmin ? <PartnerDeedsPage /> : <Navigate to="/" />;
}

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/guideline", component: GuidelinePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/my-deeds", component: GuardedMyDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/partner-deeds", component: GuardedPartnerDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds", component: GuardedDeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds/$slug", component: GuardedDeedDetailPage }),
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
