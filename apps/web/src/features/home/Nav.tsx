import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore, useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";
import { DEEDS } from "../deeds/deedData";

// Buy/Sell intentionally omitted — feature dropped from scope.
const NAV_ITEMS: { key: StringKey; to: string }[] = [
  { key: "navHome", to: "/" },
  { key: "navGuideline", to: "/guideline" },
];

export function Nav() {
  const lang = useUiStore((s) => s.lang);
  const isStaff = useIsStaff();
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const isEmployee = useAuthStore((s) => s.user?.role === "EMPLOYEE");
  const isPartner = useAuthStore((s) => s.user?.role === "PARTNER");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const t = (k: StringKey) => translate(k, lang);

  // "All Deeds" opens a click-toggled dropdown; closes on outside click.
  const [deedsOpen, setDeedsOpen] = useState(false);
  const ddRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!deedsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDeedsOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [deedsOpen]);

  // Admin "Services" dropdown (Employee Requests, Partner Requests) — same toggle pattern.
  const [servicesOpen, setServicesOpen] = useState(false);
  const svcRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!servicesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (svcRef.current && !svcRef.current.contains(e.target as Node)) setServicesOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [servicesOpen]);

  return (
    <nav className="nav">
      <div className="wrap">
        <Link to="/" className="brand">
          <BrandMark />
          <div>
            <div className="name">{t("brandName")}</div>
            <div className="sub">{t("brandSub")}</div>
          </div>
        </Link>
        <div className="menu">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "active" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {t(item.key)}
            </Link>
          ))}

          {isStaff && (
          <div className={"nav-dd" + (deedsOpen ? " open" : "")} ref={ddRef}>
            <a
              className={pathname.startsWith("/deeds") ? "active" : ""}
              onClick={() => setDeedsOpen((o) => !o)}
              aria-expanded={deedsOpen}
              aria-haspopup="menu"
            >
              {t("navDeeds")} <span className="nav-dd-caret">▾</span>
            </a>
            <div className="nav-dd-menu" role="menu">
              {(isAdmin || isEmployee) && (
                <Link to="/all-deed-details" onClick={() => setDeedsOpen(false)}>
                  {t("navAllDeedDetails")}
                </Link>
              )}
              {DEEDS.map((d) => (
                <Link
                  key={d.slug}
                  to="/deeds/$slug"
                  params={{ slug: d.slug }}
                  onClick={() => setDeedsOpen(false)}
                >
                  {d.name[lang]}
                </Link>
              ))}
            </div>
          </div>
          )}

          {isAdmin && (
            <Link to="/partner-deeds" activeProps={{ className: "active" }}>
              {t("navPartnerDeeds")}
            </Link>
          )}

          {isEmployee && (
            <Link to="/all-deeds" activeProps={{ className: "active" }}>
              {t("navAllDeeds")}
            </Link>
          )}

          {isAdmin && (
            <Link to="/company-docs" activeProps={{ className: "active" }}>
              {t("navCompanyDocs")}
            </Link>
          )}

          {isAdmin && (
            <div className={"nav-dd" + (servicesOpen ? " open" : "")} ref={svcRef}>
              <a
                className={
                  pathname === "/employee-requests" || pathname === "/partner-requests"
                    ? "active"
                    : ""
                }
                onClick={() => setServicesOpen((o) => !o)}
                aria-expanded={servicesOpen}
                aria-haspopup="menu"
              >
                {t("navServices")} <span className="nav-dd-caret">▾</span>
              </a>
              <div className="nav-dd-menu" role="menu">
                <Link to="/employee-requests" onClick={() => setServicesOpen(false)}>
                  {t("navEmployeeRequests")}
                </Link>
                <Link to="/partner-requests" onClick={() => setServicesOpen(false)}>
                  {t("navPartnerRequests")}
                </Link>
              </div>
            </div>
          )}

          {!isEmployee && !isPartner && (
            <button className="btn-partner btn-partner-sm" onClick={() => navigate({ to: "/partner" })}>
              {t("partnerWithUs")}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
