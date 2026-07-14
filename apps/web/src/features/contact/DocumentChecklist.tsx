import { createElement } from "react";
import { useLang } from "../../stores/uiStore";

type Bi = { en: string; hi: string };

const TITLE: Bi = {
    en: "Documents You'll Commonly Need",
    hi: "आमतौर पर आवश्यक दस्तावेज़",
};

const NOTE: Bi = {
    en: "The exact list depends on your deed type and district -- our team will confirm the full checklist for your specific case.",
    hi: "सटीक सूची आपके विलेख के प्रकार और ज़िले पर निर्भर करती है -- हमारी टीम आपके मामले के लिए पूरी चेकलिस्ट की पुष्टि करेगी।",
};

const DOCS: Bi[] = [
  { en: "Aadhaar card (ID proof)", hi: "आधार कार्ड (पहचान प्रमाण)" },
  { en: "PAN card", hi: "पैन कार्ड" },
  { en: "Passport-size photographs", hi: "पासपोर्ट साइज़ फोटो" },
  { en: "Original property / title documents", hi: "मूल संपत्ति / स्वामित्व दस्तावेज़" },
  { en: "Latest property tax receipt", hi: "नवीनतम संपत्ति कर रसीद" },
  { en: "Encumbrance certificate (if applicable)", hi: "भार-मुक्ति प्रमाण पत्र (यदि लागू हो)" },
  { en: "Witness ID proofs", hi: "गवाहों के पहचान प्रमाण" },
  ];

/**
 * Generic, non-deed-specific checklist -- intentionally kept general (like
 * the FAQ's approach to guideline rates) since exact document requirements
 * vary by deed type and district and shouldn't be hard-coded here.
 */
export function DocumentChecklist() {
    const lang = useLang();

  return createElement(
        "div",
    { className: "contact-info", style: { marginTop: 20 } },
        createElement("h3", { style: { marginTop: 0 } }, TITLE[lang]),
        createElement(
                "ul",
          { className: "er-docs" },
                DOCS.map((d, i) =>
                          createElement(
                                      "li",
                            { key: i },
                                      createElement("span", { className: "er-check" }, "✓"),
                                      d[lang]
                                    )
                               )
              ),
        createElement(
                "p",
          { style: { fontSize: 13, color: "var(--muted)", marginTop: 10 } },
                NOTE[lang]
              )
      );
}
