import { useUiStore } from "./stores/uiStore";
import { UtilityBar } from "./features/home/UtilityBar";
import { Nav } from "./features/home/Nav";
import { Hero } from "./features/home/Hero";
import { Services } from "./features/home/Services";
import { Footer } from "./features/home/Footer";
import { GuidelinePage } from "./features/guideline/GuidelinePage";
import { EregistryPage } from "./features/eregistry/EregistryPage";
import { AboutPage } from "./features/about/AboutPage";
import { ContactPage } from "./features/contact/ContactPage";
import { PartnerPage } from "./features/partner/PartnerPage";
import { InboxPage } from "./features/contact/InboxPage";
import { useAuthStore } from "./stores/authStore";

export function App() {
  const view = useUiStore((s) => s.view);
  const isAdmin = !!useAuthStore((s) => s.user);

  // Inbox is admin-only; fall back to home when signed out.
  const resolved = view === "inbox" && !isAdmin ? "home" : view;

  return (
    <>
      <UtilityBar />
      <Nav />
      {resolved === "home" && (
        <>
          <Hero />
          <Services />
        </>
      )}
      {resolved === "guideline" && <GuidelinePage />}
      {resolved === "eregistry" && <EregistryPage />}
      {resolved === "about" && <AboutPage />}
      {resolved === "contact" && <ContactPage />}
      {resolved === "partner" && <PartnerPage />}
      {resolved === "inbox" && <InboxPage />}
      <Footer />
    </>
  );
}
