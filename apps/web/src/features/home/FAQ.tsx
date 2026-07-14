import { useState } from "react";
import { useLang } from "../../stores/uiStore";

type Bi = { en: string; hi: string };

type FaqItem = {
  q: Bi;
  a: Bi;
};

// Keep answers general/directional on exact rates — they vary by district,
// deed type, and change over time. Point people to the live Guideline Rates
// tool for the authoritative number rather than hard-coding a figure here.
const FAQS: FaqItem[] = [
  {
    q: {
      en: "How much stamp duty and registration fee do I have to pay?",
      hi: "स्टाम्प ड्यूटी और रजिस्ट्रेशन फीस कितनी लगती है?",
    },
    a: {
      en: "In Madhya Pradesh, stamp duty is charged on the property's guideline (collector) rate or the transaction value — whichever is higher — plus a separate registration fee on top. The exact percentage depends on the deed type (sale, gift, lease, etc.) and can change over time. Check our Guideline Rates section for your district's current rate, or ask our staff for an exact calculation for your document.",
      hi: "मध्य प्रदेश में स्टाम्प ड्यूटी संपत्ति की गाइडलाइन (कलेक्टर) दर या लेन-देन मूल्य — जो भी ज़्यादा हो — पर लगती है, साथ में अलग से रजिस्ट्रेशन फीस भी लगती है। सही प्रतिशत विलेख के प्रकार (सेल, गिफ्ट, लीज़ आदि) पर निर्भर करता है और समय-समय पर बदलता रहता है। अपने जिले की मौजूदा दर के लिए हमारा Guideline Rates सेक्शन देखें, या सटीक calculation के लिए हमारे स्टाफ से पूछें।",
    },
  },
  {
    q: {
      en: "Which documents do I need to bring for property registration?",
      hi: "प्रॉपर्टी रजिस्ट्रेशन के लिए कौन-कौन से दस्तावेज़ चाहिए?",
    },
    a: {
      en: "Commonly required: Aadhaar and PAN card of buyer and seller, the previous title/ownership document of the property, property tax receipt or khasra-khatauni copy, passport-size photographs, and details of two witnesses. Exact requirements can vary slightly by deed type — our staff will give you a checklist specific to your case before your appointment.",
      hi: "आमतौर पर चाहिए: खरीदार और विक्रेता का Aadhaar व PAN कार्ड, संपत्ति का पुराना title/स्वामित्व दस्तावेज़, property tax रसीद या खसरा-खतौनी की कॉपी, पासपोर्ट साइज़ फोटो, और दो गवाहों की जानकारी। विलेख के प्रकार के अनुसार ज़रूरत थोड़ी अलग हो सकती है — अपॉइंटमेंट से पहले हमारा स्टाफ आपके केस के हिसाब से पूरी checklist दे देगा।",
    },
  },
  {
    q: {
      en: "How long does the whole registration process take?",
      hi: "पूरी रजिस्ट्री प्रक्रिया में कितना समय लगता है?",
    },
    a: {
      en: "With SAMPADA 2.0's digital process, most straightforward registrations are completed within a single day, and a large share of e-stamp/document steps finish in under 10-15 minutes once your documents are ready. Complex cases (disputed title, multiple parties) can take longer — we'll give you a realistic timeline upfront.",
      hi: "SAMPADA 2.0 की digital प्रक्रिया से ज़्यादातर सीधी रजिस्ट्री एक ही दिन में पूरी हो जाती है, और दस्तावेज़ तैयार होने के बाद e-stamp/document के कई स्टेप्स 10-15 मिनट में पूरे हो जाते हैं। जटिल मामलों (विवादित स्वामित्व, कई पक्ष) में ज़्यादा समय लग सकता है — हम शुरुआत में ही आपको सही समय-सीमा बता देंगे।",
    },
  },
  {
    q: {
      en: "Can I get my property registered without visiting your office?",
      hi: "क्या बिना ऑफिस आए भी रजिस्ट्री हो सकती है?",
    },
    a: {
      en: "Yes. We offer home service — our team can visit you to collect and prepare documents, and complete the signing process on SAMPADA 2.0 from your doorstep. Documents like mortgage, lease, power of attorney, and agreements can be fully handled this way.",
      hi: "जी हां। हम गृह सेवा (home service) देते हैं — हमारी टीम खुद आपके घर आकर दस्तावेज़ इकट्ठा और तैयार करती है, और SAMPADA 2.0 पर हस्ताक्षर प्रक्रिया भी घर से पूरी करती है। बंधक, पट्टा, मुख़्तारनामा और अनुबंध जैसे दस्तावेज़ इस तरह पूरी तरह संभव हैं।",
    },
  },
  {
    q: {
      en: "Are guideline rates the same across all districts?",
      hi: "क्या गाइडलाइन दरें सभी जिलों में एक जैसी होती हैं?",
    },
    a: {
      en: "No — guideline (collector) rates are set separately for each of Madhya Pradesh's 51 districts, and often vary by colony, road, or locality within a district too. Use our Guideline Rates tool and select your specific district to see the correct rate for your property.",
      hi: "नहीं — गाइडलाइन (कलेक्टर) दरें मध्य प्रदेश के हर 51 जिलों के लिए अलग-अलग तय होती हैं, और अक्सर एक ही जिले में कॉलोनी, रोड या इलाके के हिसाब से भी अलग होती हैं। अपनी संपत्ति की सही दर देखने के लिए हमारा Guideline Rates टूल इस्तेमाल करें और अपना ज़िला चुनें।",
    },
  },
  {
    q: {
      en: "What types of deeds can you help me with?",
      hi: "आप किस-किस तरह के विलेख बनाने में मदद करते हैं?",
    },
    a: {
      en: "We handle all major property instruments — sale deed, gift deed, lease deed, partition deed, mortgage, power of attorney, and agreements — with bilingual explanations so you understand every clause before signing.",
      hi: "हम सभी प्रमुख संपत्ति दस्तावेज़ों में मदद करते हैं — सेल डीड, गिफ्ट डीड, पट्टा (लीज़) डीड, विभाजन डीड, बंधक, मुख़्तारनामा और अनुबंध — द्विभाषी व्याख्या के साथ ताकि साइन करने से पहले आप हर धारा समझ सकें।",
    },
  },
];

export function FAQ() {
  const lang = useLang();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="faq">
      <div className="wrap">
        <h2>{lang === "hi" ? "अक्सर पूछे जाने वाले सवाल" : "Frequently Asked Questions"}</h2>
        <p className="faq-sub">
          {lang === "hi"
            ? "रजिस्ट्री और स्टाम्प ड्यूटी से जुड़े सबसे आम सवालों के जवाब।"
            : "Answers to the most common questions about property registration and stamp duty."}
        </p>

        <div className="faq-list">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div className={`faq-item${isOpen ? " open" : ""}`} key={i}>
                <button
                  type="button"
                  className="faq-q"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{item.q[lang]}</span>
                  <span className="faq-caret">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && <p className="faq-a">{item.a[lang]}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Structured data so search engines can show these as rich FAQ
          results — always in English/canonical text regardless of UI lang. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q.en,
              acceptedAnswer: {
                "@type": "Answer",
                text: f.a.en,
              },
            })),
          }),
        }}
      />
    </section>
  );
}
