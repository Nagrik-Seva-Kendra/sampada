import { Link } from "@tanstack/react-router";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { IconDeed } from "../../components/icons";
import { DEEDS } from "./deedData";

export function DeedsPage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navDeeds")}
        </div>
        <h2 className="page-title">{t("deedsTitle")}</h2>
        <p className="er-sub">{t("deedsSubtitle")}</p>

        <div className="deed-grid">
          {DEEDS.map((d) => (
            <Link key={d.slug} to="/deeds/$slug" params={{ slug: d.slug }} className="deed-card">
              <span className="icon">
                <IconDeed />
              </span>
              <div className="h">{d.name[lang]}</div>
              <p>{d.tagline[lang]}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
