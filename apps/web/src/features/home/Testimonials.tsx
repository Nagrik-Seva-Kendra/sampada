import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";

type Testimonial = {
  name: string;
  city: { en: string; hi: string };
  rating: number; // 1–5
  deedType: { en: string; hi: string };
  text: { en: string; hi: string };
};

// Replace/extend with real client reviews as they come in (WhatsApp/phone
// follow-up after a deed is completed works well for collecting these).
const TESTIMONIALS: Testimonial[] = [
  {
    name: "राजेश शर्मा",
    city: { en: "Gwalior", hi: "ग्वालियर" },
    rating: 5,
    deedType: { en: "Sale Deed", hi: "विक्रय विलेख" },
    text: {
      en: "Got my sale deed prepared and registered within a day. Very clear process, no running around offices.",
      hi: "मेरी सेल डीड एक ही दिन में तैयार होकर रजिस्टर हो गई। बहुत साफ प्रक्रिया, दफ्तरों के चक्कर नहीं लगाने पड़े।",
    },
  },
  {
    name: "सुनीता वर्मा",
    city: { en: "Morena", hi: "मुरैना" },
    rating: 5,
    deedType: { en: "Lease Deed", hi: "पट्टा विलेख" },
    text: {
      en: "Staff explained the lease deed process in Hindi, step by step. Felt confident before signing anything.",
      hi: "स्टाफ ने पट्टा विलेख की पूरी प्रक्रिया हिंदी में समझाई। साइन करने से पहले पूरा भरोसा हो गया था।",
    },
  },
  {
    name: "अनिल कुशवाह",
    city: { en: "Bhind", hi: "भिंड" },
    rating: 4,
    deedType: { en: "Partition Deed", hi: "विभाजन विलेख" },
    text: {
      en: "Partition deed between three brothers, handled cleanly. All the paperwork was done without a single trip to the tehsil office.",
      hi: "तीन भाइयों के बीच विभाजन विलेख आसानी से हो गया। सारा काम बिना तहसील कार्यालय जाए पूरा हो गया।",
    },
  },
  {
    name: "प्रिया जैन",
    city: { en: "Gwalior", hi: "ग्वालियर" },
    rating: 5,
    deedType: { en: "Gift Deed", hi: "दान विलेख" },
    text: {
      en: "Quick turnaround on the gift deed and a printed copy the same evening. Recommended to my whole family.",
      hi: "गिफ्ट डीड जल्दी बन गई और उसी शाम प्रिंट कॉपी भी मिल गई। पूरे परिवार को सुझाया है।",
    },
  },
  {
    name: "मोहन लाल तिवारी",
    city: { en: "Datia", hi: "दतिया" },
    rating: 5,
    deedType: { en: "Mortgage Deed", hi: "बंधक विलेख" },
    text: {
      en: "Needed urgent property documents before a bank loan application — everything was prepared and verified within a day.",
      hi: "बैंक लोन के लिए संपत्ति दस्तावेज़ जल्दी चाहिए थे — यहां एक ही दिन में सब तैयार और सत्यापित हो गया।",
    },
  },
  {
    name: "कविता ठाकुर",
    city: { en: "Shivpuri", hi: "शिवपुरी" },
    rating: 4,
    deedType: { en: "Sale Deed", hi: "विक्रय विलेख" },
    text: {
      en: "Bilingual documents made it easy for my elderly parents to understand every clause before registration.",
      hi: "द्विभाषी दस्तावेज़ों की वजह से मेरे बुज़ुर्ग माता-पिता रजिस्ट्री से पहले हर बात आसानी से समझ पाए।",
    },
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="t-stars" aria-label={`${rating} / 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < rating ? "on" : ""}>
          ★
        </span>
      ))}
    </div>
  );
}

function Card({
  r,
  lang,
}: {
  r: Testimonial;
  lang: "en" | "hi";
}) {
  return (
    <div className="t-card">
      <Stars rating={r.rating} />
      <p className="t-text">&ldquo;{r.text[lang]}&rdquo;</p>
      <div className="t-foot">
        <span className="t-avatar">{r.name.charAt(0)}</span>
        <div>
          <div className="t-name">{r.name}</div>
          <div className="t-meta">
            {r.city[lang]} · {r.deedType[lang]}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Testimonials() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);

  return (
    <section className="testimonials">
      <div className="wrap">
        <h2>{t("testimonialsTitle")}</h2>
        <p className="testimonials-sub">{t("testimonialsSub")}</p>
      </div>
      <div className="t-track-wrap">
        <div className="t-track">
          {/* Rendered twice back-to-back so the loop is seamless — the
              animation slides exactly one copy's width then resets. */}
          {TESTIMONIALS.map((r, i) => (
            <Card r={r} lang={lang} key={`a-${i}`} />
          ))}
          <div aria-hidden style={{ display: "contents" }}>
            {TESTIMONIALS.map((r, i) => (
              <Card r={r} lang={lang} key={`b-${i}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
