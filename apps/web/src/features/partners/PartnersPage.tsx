import { createElement } from "react";
import { useLang } from "../../stores/uiStore";

type Bi = { en: string; hi: string };

const PHONE_NUMBER = "917898475648";
const PARTNER_MESSAGE =
    "Hi, I am a Sampada 2 service provider and I would like to explore partnering with Nagrik Seva Kendra.";
const WHATSAPP_LINK = `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(PARTNER_MESSAGE)}`;

const KICKER: Bi = { en: "For Sampada 2 Service Providers", hi: "संपदा दो सेवा प्रदाताओं के लिए" };
const TITLE: Bi = { en: "Partner With Nagrik Seva Kendra", hi: "नागरिक सेवा केंद्र के साथ पार्टनर बनें" };
const SUB: Bi = {
    en: "Already registered as a service provider on Sampada 2? Work with the #1-ranked provider in the region -- refer or co-handle cases with us and grow together, instead of alone.",
    hi: "क्या आप पहले से संपदा दो पर सेवा प्रदाता के रूप में पंजीकृत हैं? क्षेत्र के #1 सेवा प्रदाता के साथ काम करें -- अकेले नहीं, हमारे साथ मिलकर मामले संभालें या रेफर करें और साथ मिलकर आगे बढ़ें।",
};


const CARDS: { icon: string; title: Bi; desc: Bi }[] = [
  {
        icon: "💰",
        title: { en: "Earn on Every Referral", hi: "हर रेफरल पर कमाई" },
        desc: {
                en: "Send us a case or work it together -- every referral is tracked and paid out, no fine print.",
                hi: "हमें कोई केस भेजें या मिलकर काम करें -- हर रेफरल ट्रैक होता है और उसका भुगतान होता है, कोई छुपी शर्त नहीं।",
        },
  },
  {
        icon: "🏆",
        title: { en: "A Trusted Name, Ready Clients", hi: "भरोसेमंद नाम, तैयार ग्राहक" },
        desc: {
                en: "15+ years of experience, 7,000+ documents completed, and the #1-ranked provider on the official Sampada 2 portal -- your clients get that reputation too.",
                hi: "15+ वर्षों का अनुभव, 7,000+ पूर्ण दस्तावेज़, और संपदा दो पोर्टल पर #1 रैंक -- आपके ग्राहकों को भी यही भरोसा मिलता है।",
        },
  },
  {
        icon: "🎓",
        title: { en: "Training & Tech Support", hi: "प्रशिक्षण और तकनीकी सहायता" },
        desc: {
                en: "Get hands-on help with the Sampada 2 process, digital drafting tools, and day-to-day office support from our team.",
                hi: "संपदा दो प्रक्रिया, डिजिटल ड्राफ्टिंग टूल्स, और रोज़ के कार्यालय सहयोग में हमारी टीम से सीधी मदद पाएं।",
        },
  },
  ];

const STATS: { value: string; label: Bi }[] = [
  { value: "15+", label: { en: "Years of experience", hi: "वर्षों का अनुभव" } },
  { value: "7,000+", label: { en: "Documents completed", hi: "पूर्ण दस्तावेज़" } },
  { value: "#1", label: { en: "Provider on Sampada 2", hi: "संपदा दो पर शीर्ष प्रदाता" } },
  ];

const STEPS_TITLE: Bi = { en: "How Partnering Works", hi: "पार्टनरशिप कैसे काम करती है" };
const STEPS: Bi[] = [
  {
        en: "Message us on WhatsApp with your Sampada 2 provider details",
        hi: "अपने संपदा दो प्रदाता विवरण के साथ हमें व्हाट्सएप पर संदेश भेजें",
  },
  {
        en: "A short call to understand your area and case types",
        hi: "आपके क्षेत्र और केस प्रकार को समझने के लिए एक संक्षिप्त कॉल",
  },
  {
        en: "We agree on referral / co-working terms upfront",
        hi: "हम पहले ही रेफरल / सहयोग की शर्तें तय कर लेते हैं",
  },
  {
        en: "Start referring or co-handling cases and get paid on schedule",
        hi: "केस रेफर करना या मिलकर संभालना शुरू करें और समय पर भुगतान पाएं",
  },
  ];

const CTA_TITLE: Bi = { en: "Ready to partner with us?", hi: "हमारे साथ पार्टनर बनने के लिए तैयार हैं?" };
const CTA_BODY: Bi = {
    en: "Message us on WhatsApp with your name and Sampada 2 provider details -- we'll get back to you quickly.",
    hi: "अपना नाम और संपदा दो प्रदाता विवरण के साथ हमें व्हाट्सएप पर संदेश भेजें -- हम जल्द ही आपसे संपर्क करेंगे।",
};
const CTA_BUTTON: Bi = { en: "Message on WhatsApp", hi: "व्हाट्सएप पर संदेश भेजें" };

export function PartnersPage() {
    const lang = useLang();

  return createElement(
        "section",
    { className: "page" },
        createElement(
                "div",
          { className: "wrap" },
                createElement(
                          "div",
                  { className: "kicker" },
                          createElement("span", { className: "rule" }),
                          KICKER[lang]
                        ),
                createElement("h2", { className: "page-title" }, TITLE[lang]),
                createElement("p", { className: "er-sub" }, SUB[lang]),

                createElement(
                          "div",
                  { className: "grid", style: { marginTop: 28 } },
                          CARDS.map((c) =>
                                      createElement(
                                                    "div",
                                        { className: "card", key: c.title.en },
                                                    createElement("span", { className: "icon" }, c.icon),
                                                    createElement("div", { className: "h" }, c.title[lang]),
                                                    createElement("p", null, c.desc[lang])
                                                  )
                                            )
                        ),

                createElement(
                          "div",
                  { className: "about-stats", style: { marginTop: 34 } },
                          STATS.map((s) =>
                                      createElement(
                                                    "div",
                                        { className: "about-stat", key: s.value },
                                                    createElement("div", { className: "about-stat-value" }, s.value),
                                                    createElement("div", { className: "about-stat-label" }, s.label[lang])
                                                  )
                                            )
                        ),

                createElement("h3", { className: "er-section" }, STEPS_TITLE[lang]),
                createElement(
                          "ul",
                  { className: "er-docs" },
                          STEPS.map((s, i) =>
                                      createElement(
                                                    "li",
                                        { key: i },
                                                    createElement("span", { className: "er-check" }, "✓"),
                                                    s[lang]
                                                  )
                                            )
                        ),

                createElement(
                          "div",
                  { className: "contact-form", style: { marginTop: 28, maxWidth: 480 } },
                          createElement("h3", null, CTA_TITLE[lang]),
                          createElement("p", null, CTA_BODY[lang]),
                          createElement(
                                      "a",
                            { className: "btn-calc", href: WHATSAPP_LINK, target: "_blank", rel: "noreferrer" },
                                      CTA_BUTTON[lang]
                                    )
                        )
              )
      );
}
