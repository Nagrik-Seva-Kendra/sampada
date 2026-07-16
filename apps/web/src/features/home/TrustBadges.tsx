import { createElement, useEffect, useState } from "react";
import { useLang } from "../../stores/uiStore";
import { api } from "../../lib/api";

type Bi = { en: string; hi: string };

const BADGES: { value: string; label: Bi }[] = [
  { value: "15+", label: { en: "Years of experience", hi: "वर्षों का अनुभव" } },
  { value: "7,000+", label: { en: "Documents completed", hi: "पूर्ण दस्तावेज़" } },
  { value: "#1", label: { en: "Provider on Sampada 2", hi: "संपदा दो पर शीर्ष प्रदाता" } },
];

/**
 * Compact trust-signal strip shown right under the Hero, reusing the same
 * verified figures already published in the Our Story section further down
 * the page (15+ years, 7,000+ documents, #1 Sampada 2 provider ranking).
 * The "Documents completed" figure is fetched live from the API
 * (GET /stats/deeds-count = total DeedTemplate rows) so it grows automatically
 * as staff draft deeds; the static "7,000+" stays as the fallback until it loads.
 * Written with createElement instead of JSX to keep this file's markup
 * unambiguous for tooling that treats angle-bracket tags specially.
 */
export function TrustBadges() {
  const lang = useLang();
  const [deeds, setDeeds] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get("stats/deeds-count")
      .json<{ count: number }>()
      .then((d) => {
        if (alive) setDeeds(d.count);
      })
      .catch(() => {
        /* keep the static fallback on error */
      });
    return () => {
      alive = false;
    };
  }, []);

  const badges = BADGES.map((b) =>
    b.label.en === "Documents completed" && deeds != null
      ? { ...b, value: `${deeds.toLocaleString("en-IN")}+` }
      : b
  );

  return createElement(
    "section",
    { className: "services", style: { paddingTop: 0, paddingBottom: 18 } },
    createElement(
      "div",
      { className: "wrap about-stats", style: { marginTop: 0 } },
      badges.map((b) =>
        createElement(
          "div",
          { className: "about-stat", key: b.label.en },
          createElement("div", { className: "about-stat-value" }, b.value),
          createElement("div", { className: "about-stat-label" }, b.label[lang])
        )
      )
    )
  );
}
