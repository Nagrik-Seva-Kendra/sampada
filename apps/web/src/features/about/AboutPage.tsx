import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

const STATS: { value: string; label: StringKey }[] = [
  { value: "51", label: "aboutStat1" },
  { value: "2015–2026", label: "aboutStat2" },
  { value: "2.4L+", label: "aboutStat3" },
];

export function AboutPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navHome")}
        </div>
        <h2 className="page-title">{t("aboutTitle")}</h2>
        <p className="er-sub">{t("aboutP1")}</p>
        <p className="er-sub">{t("aboutP2")}</p>

        <div className="about-stats">
          {STATS.map((s) => (
            <div className="about-stat" key={s.label}>
              <div className="about-stat-value">{s.value}</div>
              <div className="about-stat-label">{t(s.label)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
