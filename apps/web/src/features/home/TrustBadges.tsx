import { createElement } from "react";
import { useLang } from "../../stores/uiStore";

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
 * Written with createElement instead of JSX to keep this file's markup
 * unambiguous for tooling that treats angle-bracket tags specially.
 */
export function TrustBadges() {
    const lang = useLang();
    return createElement(
          "section",
      { className: "services", style: { paddingTop: 0, paddingBottom: 18 } },
          createElement(
                  "div",
            { className: "wrap about-stats", style: { marginTop: 0 } },
                  BADGES.map((b) =>
                            createElement(
                                        "div",
                              { className: "about-stat", key: b.value },
                                        createElement("div", { className: "about-stat-value" }, b.value),
                                        createElement("div", { className: "about-stat-label" }, b.label[lang])
                                      )
                                   )
                )
        );
}
