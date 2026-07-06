import { Link, Navigate, useParams } from "@tanstack/react-router";
import type { DeedType } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { DeedRecordsTable } from "./DeedRecordsTable";

export function DeedDetailPage() {
  const { slug } = useParams({ from: "/deeds/$slug" });
  const lang = useLang();
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

        <h3 className="er-section">{t("deedsSamplesHead")}</h3>
        <DeedRecordsTable type={slug as DeedType} />
      </div>
    </section>
  );
}
