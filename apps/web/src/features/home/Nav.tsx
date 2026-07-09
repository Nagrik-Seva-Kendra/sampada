import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";

// Buy/Sell intentionally omitted — feature dropped from scope.
const NAV_ITEMS: { key: StringKey; to: string }[] = [{ key: "navHome", to: "/" }];

export function Nav() {
  const lang = useUiStore((s) => s.lang);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const isEmployee = useAuthStore((s) => s.user?.role === "EMPLOYEE");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const t = (k: StringKey) => translate(k, lang);

  // Admin "Services" dropdown (Employee Requests) — click-toggled, closes on outside click.
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

          {(isAdmin || isEmployee) && (
            <Link to="/all-deed-details" activeProps={{ className: "active" }}>
              {t("navAllDeedDetails")}
            </Link>
          )}

          {isAdmin && (
            <div className={"nav-dd" + (servicesOpen ? " open" : "")} ref={svcRef}>
              <a
                className={pathname === "/employee-requests" ? "active" : ""}
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
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
