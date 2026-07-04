import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

const BENEFITS: StringKey[] = ["partnerB1", "partnerB2", "partnerB3"];

export function PartnerPage() {
  const lang = useUiStore((s) => s.lang);
  const setView = useUiStore((s) => s.setView);
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("partnerTitle")}
        </div>
        <h2 className="page-title">{t("partnerTitle")}</h2>
        <p className="er-sub">{t("partnerP")}</p>

        <ul className="er-docs">
          {BENEFITS.map((b) => (
            <li key={b}>
              <span className="er-check">✓</span> {t(b)}
            </li>
          ))}
        </ul>

        <div className="er-note">
          <button className="btn-calc" onClick={() => setView("contact")}>
            {t("partnerCta")}
          </button>
        </div>
      </div>
    </section>
  );
}
