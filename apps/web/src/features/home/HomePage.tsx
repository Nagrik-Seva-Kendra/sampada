import { Link } from "@tanstack/react-router";
import type { HomeCard } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { StringKey } from "../../i18n/strings";
import { useWaT } from "../whatsapp/waI18n";
import { useHomeSummary } from "./useHome";
import "./home.css";

/** Today's numbers for the office (managers) or for the signed-in staff member; every card opens its page. */
export function HomePage() {
  const { t } = useWaT();
  const q = useHomeSummary();
  const name = q.data?.name;
  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("hmKicker")}
        </div>
        <div className="page-head">
          <h2 className="page-title">{name ? t("hmGreeting", { name }) : t("hmGreetingNoName")}</h2>
        </div>
        {q.data && <p className="doc-sub">{t(q.data.canManage ? "hmSubManager" : "hmSubStaff")}</p>}
        {q.isLoading && (
          <div className="home-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}
        {q.isError && <p className="modal-error">{t("hmLoadError")}</p>}
        {q.data && (
          <div className="home-grid">
            {q.data.cards.map((c) => (
              <HomeCardLink key={c.key} card={c} />
            ))}
            <Link to="/deeds" className="home-card">
              <span className="home-card-label">{t("hmAllDeeds")}</span>
              <span className="home-card-value">→</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function HomeCardLink({ card }: { card: HomeCard }) {
  const { t } = useWaT();
  return (
    <Link to={card.to} className={"home-card" + (card.alert ? " alert" : "")} data-card={card.key}>
      <span className="home-card-label">{t(`hmCard_${card.key}` as StringKey)}</span>
      <span className="home-card-value">
        {card.value}
        {card.total != null && <small> {t("hmOf", { n: card.total })}</small>}
      </span>
    </Link>
  );
}
