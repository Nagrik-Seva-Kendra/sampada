import { useNavigate } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

const STEPS: { title: StringKey; desc: StringKey }[] = [
  { title: "erStep1", desc: "erStep1d" },
  { title: "erStep2", desc: "erStep2d" },
  { title: "erStep3", desc: "erStep3d" },
  { title: "erStep4", desc: "erStep4d" },
  { title: "erStep5", desc: "erStep5d" },
  { title: "erStep6", desc: "erStep6d" },
];

const DOCS: StringKey[] = ["erDoc1", "erDoc2", "erDoc3", "erDoc4", "erDoc5"];

export function EregistryPage() {
  const lang = useUiStore((s) => s.lang);
  const navigate = useNavigate();
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navEregistry")}
        </div>
        <h2 className="page-title">{t("erTitle")}</h2>
        <p className="er-sub">{t("erSubtitle")}</p>

        {/* Process steps */}
        <h3 className="er-section">{t("erStepsHead")}</h3>
        <ol className="er-steps">
          {STEPS.map((s, i) => (
            <li className="er-step" key={s.title}>
              <span className="er-num">{i + 1}</span>
              <div>
                <div className="er-step-title">{t(s.title)}</div>
                <p className="er-step-desc">{t(s.desc)}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Documents */}
        <h3 className="er-section">{t("erDocsHead")}</h3>
        <ul className="er-docs">
          {DOCS.map((d) => (
            <li key={d}>
              <span className="er-check">✓</span> {t(d)}
            </li>
          ))}
        </ul>

        {/* Note + CTA */}
        <div className="er-note">
          <p>{t("erNote")}</p>
          <button className="btn-calc" onClick={() => navigate({ to: "/guideline" })}>
            {t("erViewRates")}
          </button>
        </div>
      </div>
    </section>
  );
}
