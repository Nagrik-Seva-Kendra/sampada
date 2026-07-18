import type { JSX } from "react";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { IconEregistry, IconDeed } from "../../components/icons";

const CARDS: { icon: () => JSX.Element; title: StringKey; desc: StringKey }[] = [
  { icon: IconEregistry, title: "svcDeeds", desc: "svcDeedsDesc" },
  { icon: IconDeed, title: "svcDeed", desc: "svcDeedDesc" },
];

export function Services() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="services">
      <div className="wrap">
        <h2>{t("servicesTitle")}</h2>
        <div className="grid">
          {CARDS.map((c) => (
            <div className="card" key={c.title}>
              <span className="icon">{c.icon()}</span>
              <div className="h">{t(c.title)}</div>
              <p>{t(c.desc)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
