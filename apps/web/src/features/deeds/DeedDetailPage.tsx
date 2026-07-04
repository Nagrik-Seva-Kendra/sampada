import { Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";

export function DeedDetailPage() {
  const { slug } = useParams({ from: "/deeds/$slug" });
  const lang = useLang();
  const navigate = useNavigate();
  const t = (k: StringKey) => translate(k, lang);

  const deed = findDeed(slug);
  if (!deed) return <Navigate to="/deeds" />;

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          <Link to="/deeds">{t("deedsBackAll")}</Link>
        </div>
        <h2 className="page-title">{deed.name[lang]}</h2>
        <p className="er-sub">{deed.tagline[lang]}</p>

        {deed.about.map((p, i) => (
          <p key={i} className="deed-about">
            {p[lang]}
          </p>
        ))}

        <h3 className="er-section">{t("deedsDocsHead")}</h3>
        <ul className="er-docs">
          {deed.docs.map((d, i) => (
            <li key={i}>
              <span className="er-check">✓</span> {d[lang]}
            </li>
          ))}
        </ul>

        <div className="er-note">
          <p>{t("deedsStampNote")}</p>
          <button className="btn-calc" onClick={() => navigate({ to: "/guideline" })}>
            {t("viewRates")}
          </button>
        </div>
      </div>
    </section>
  );
}
