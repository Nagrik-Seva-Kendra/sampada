import { useUiStore, type View } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { BrandMark } from "../../components/icons";

// Buy/Sell intentionally omitted — feature dropped from scope.
// `implemented: false` items route to home until their page is built.
const NAV_ITEMS: { key: StringKey; view: View; implemented: boolean }[] = [
  { key: "navHome", view: "home", implemented: true },
  { key: "navGuideline", view: "guideline", implemented: true },
  { key: "navEregistry", view: "eregistry", implemented: true },
];

export function Nav() {
  const lang = useUiStore((s) => s.lang);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const t = (k: StringKey) => translate(k, lang);

  return (
    <nav className="nav">
      <div className="wrap">
        <div className="brand" onClick={() => setView("home")}>
          <BrandMark />
          <div>
            <div className="name">{t("brandName")}</div>
            <div className="sub">{t("brandSub")}</div>
          </div>
        </div>
        <div className="menu">
          {NAV_ITEMS.map((item, i) => (
            <a
              key={i}
              className={item.implemented && item.view === view ? "active" : ""}
              onClick={() => setView(item.view)}
            >
              {t(item.key)}
            </a>
          ))}
          <button className="btn-partner" onClick={() => setView("partner")}>
            {t("partnerWithUs")}
          </button>
        </div>
      </div>
    </nav>
  );
}
