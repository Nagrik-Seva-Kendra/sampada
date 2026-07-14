import { Link } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

const LINKS: { key: StringKey; to?: string; href?: string }[] = [
  { key: "footAbout", to: "/about" },
  { key: "footMpigr", href: "https://www.mpigr.gov.in/" },
];

// Same address shown in the nav brand line — kept as one source of truth
// here since the map embed needs it as a query string.
const OFFICE_ADDRESS =
  "G-11,12 Millenium Plaza, University Road, Govindpuri, Gwalior, Madhya Pradesh 474011";
const MAP_EMBED_SRC = `https://www.google.com/maps?q=${encodeURIComponent(OFFICE_ADDRESS)}&output=embed`;
const MAP_DIRECTIONS_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(OFFICE_ADDRESS)}`;

export function Footer() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);

  return (
    <footer className="foot">
      {/* Walk-in clients often just need directions — an embedded map is
          faster than typing the address into their own maps app. */}
      <div className="foot-map">
        <iframe
          title={lang === "hi" ? "नागरिक सेवा केंद्र — कार्यालय स्थान" : "Nagrik Seva Kendra — office location"}
          src={MAP_EMBED_SRC}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="wrap">
        <span className="name">{t("brandName")}</span>
        <div className="contact">
          <span>{t("phone")}</span>
          <span>{t("email")}</span>
          <a href={MAP_DIRECTIONS_LINK} target="_blank" rel="noreferrer">
            {lang === "hi" ? "दिशा-निर्देश पाएं" : "Get directions"}
          </a>
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
