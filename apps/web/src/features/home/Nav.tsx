import { Link, useNavigate } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";

// Buy/Sell intentionally omitted — feature dropped from scope.
const NAV_ITEMS: { key: StringKey; to: string }[] = [
  { key: "navHome", to: "/" },
  { key: "navGuideline", to: "/guideline" },
  { key: "navEregistry", to: "/eregistry" },
];

export function Nav() {
  const lang = useUiStore((s) => s.lang);
  const navigate = useNavigate();
  const t = (k: StringKey) => translate(k, lang);

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
          <button className="btn-partner" onClick={() => navigate({ to: "/partner" })}>
            {t("partnerWithUs")}
          </button>
        </div>
      </div>
    </nav>
  );
}
