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

          <button className="btn-partner" onClick={() => navigate({ to: "/partner" })}>
            {t("partnerWithUs")}
          </button>
        </div>
      </div>
    </nav>
  );
}
