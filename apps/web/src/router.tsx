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
import { AboutPage } from "./features/about/AboutPage";
import { ContactPage } from "./features/contact/ContactPage";
import { PartnerPage } from "./features/partner/PartnerPage";
import { InboxPage } from "./features/contact/InboxPage";
import { useAuthStore } from "./stores/authStore";

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

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/guideline", component: GuidelinePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds", component: DeedsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/deeds/$slug", component: DeedDetailPage }),
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
