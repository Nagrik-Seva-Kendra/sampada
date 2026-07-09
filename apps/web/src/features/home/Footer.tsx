import { Link } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

const LINKS: { key: StringKey; to?: string; href?: string }[] = [
  { key: "footAbout", to: "/about" },
  { key: "footMpigr", href: "https://www.mpigr.gov.in/" },
];

export function Footer() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);

  return (
    <footer className="foot">
      <div className="wrap">
        <span className="name">{t("brandName")}</span>
        <div className="contact">
          <span>{t("phone")}</span>
          <span>{t("email")}</span>
        </div>
        <div className="links">
          {LINKS.map((l) =>
            l.href ? (
              <a key={l.key} href={l.href} target="_blank" rel="noreferrer">
                {t(l.key)}
              </a>
            ) : (
              <Link key={l.key} to={l.to!}>
                {t(l.key)}
              </Link>
            ),
          )}
        </div>
        <span style={{ opacity: 0.75 }}>{t("copyright")}</span>
      </div>
    </footer>
  );
}
