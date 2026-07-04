import { useUiStore, type View } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

const LINKS: { key: StringKey; view?: View; href?: string }[] = [
  { key: "footAbout", view: "about" },
  { key: "footPartner", view: "partner" },
  { key: "footContact", view: "contact" },
  { key: "footMpigr", href: "https://www.mpigr.gov.in/" },
];

export function Footer() {
  const lang = useUiStore((s) => s.lang);
  const setView = useUiStore((s) => s.setView);
  const t = (k: StringKey) => translate(k, lang);

  return (
    <footer className="foot">
      <div className="wrap">
        <span className="name">{t("brandName")}</span>
        <div className="links">
          {LINKS.map((l) =>
            l.href ? (
              <a key={l.key} href={l.href} target="_blank" rel="noreferrer">
                {t(l.key)}
              </a>
            ) : (
              <a key={l.key} onClick={() => setView(l.view!)}>
                {t(l.key)}
              </a>
            ),
          )}
        </div>
        <span style={{ opacity: 0.75 }}>{t("copyright")}</span>
      </div>
    </footer>
  );
}
