import { useNavigate } from "@tanstack/react-router";
import { useUiStore } from "../../stores/uiStore";
import { useIsStaff } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";

export function Hero() {
  const lang = useUiStore((s) => s.lang);
  const isStaff = useIsStaff();
  const navigate = useNavigate();
  const t = (k: StringKey) => translate(k, lang);

  return (
    <header className="hero">
      <div className="wrap">
        <div>
          <div className="kicker">
            <span className="rule" />
            {t("heroKicker")}
          </div>
          <h1>{t("heroTitle")}</h1>
          <p>{t("heroSub")}</p>

          <div className="hero-cta">
            {isStaff ? (
              <button className="btn-partner" onClick={() => navigate({ to: "/deeds" })}>
                {t("navDeeds")}
              </button>
            ) : (
              <button className="btn-partner" onClick={() => navigate({ to: "/partner" })}>
                {t("partnerWithUs")}
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="photo">
            <img
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1100&q=75"
              alt="Property"
            />
            <div className="caption">
              <span className="t">{t("captionTitle")}</span>
              <span className="v">{t("captionValued")}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
