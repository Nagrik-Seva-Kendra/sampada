import { useLang } from "../../stores/uiStore";

type Bi = { en: string; hi: string };

const HEADING: Bi = {
  en: "Nagrik Seva Kendra — Where Trust Is Our Identity",
  hi: "नागरिक सेवा केंद्र — जहाँ भरोसा ही हमारी पहचान है",
};

const INTRO: Bi = {
  en: "For the past fifteen years, Nagrik Seva Kendra has been a trusted companion to thousands of families across the Gwalior region. When it comes to registering your most valuable asset — your home, your land — we know it takes more than just service, it takes trust. And that is exactly what we have earned, year after year.",
  hi: "पिछले पंद्रह वर्षों से, नागरिक सेवा केंद्र ग्वालियर क्षेत्र के हज़ारों परिवारों का विश्वसनीय साथी रहा है। जब बात आती है आपकी सबसे कीमती संपत्ति — आपके घर, आपकी ज़मीन — की रजिस्ट्री की, तो हम जानते हैं कि सिर्फ सेवा नहीं, बल्कि भरोसा चाहिए। और यही भरोसा हमने साल दर साल कमाया है।",
};

const STORY_TITLE: Bi = {
  en: "Our Story — Hard Work, Experience, and Constant Evolution",
  hi: "हमारी कहानी — मेहनत, अनुभव और लगातार बदलाव की",
};

const STORY_BODY: Bi = {
  en: "In 2011, Mr. Rajesh Kumar Sharma laid the foundation of this journey with a humble beginning — when everything was still written by hand. In 2015, we stepped into the digital era with Sampada 1, and in 2025 we moved forward again with Sampada 2 and our new website. To date, we have successfully prepared and registered over 7,000 documents.",
  hi: "वर्ष दो हज़ार ग्यारह में श्री राजेश कुमार शर्मा जी ने एक साधारण सी शुरुआत के साथ इस सफर की नींव रखी — तब सब कुछ हाथ से लिखा जाता था। वर्ष दो हज़ार पंद्रह में संपदा एक के साथ हमने डिजिटल युग में कदम रखा, और वर्ष दो हज़ार पच्चीस में संपदा दो और अपनी नई वेबसाइट के साथ हम फिर आगे बढ़े। आज तक हमने सात हज़ार से अधिक दस्तावेज़ सफलतापूर्वक तैयार और पंजीकृत किए हैं।",
};

const TIMELINE: { year: string; text: Bi }[] = [
  {
    year: "2011",
    text: {
      en: "Manual service began, built on hard work and trust.",
      hi: "मेहनत और भरोसे के साथ मैनुअल सेवा की शुरुआत।",
    },
  },
  {
    year: "2015",
    text: {
      en: "Stepped into the digital era with Sampada 1.",
      hi: "संपदा एक अपनाकर डिजिटल युग में कदम।",
    },
  },
  {
    year: "2025",
    text: {
      en: "New heights with Sampada 2, a new website, and home service.",
      hi: "संपदा दो, नई वेबसाइट, और गृह सेवा के साथ नई ऊंचाइयां।",
    },
  },
];

const STATS: { value: string; label: Bi }[] = [
  { value: "15+", label: { en: "Years of experience", hi: "वर्षों का अनुभव" } },
  { value: "7,000+", label: { en: "Documents completed", hi: "पूर्ण दस्तावेज़" } },
  { value: "#1", label: { en: "Provider on Sampada 2", hi: "संपदा दो पर शीर्ष प्रदाता" } },
];

const TOP_PROVIDER: Bi = {
  en: "On the official Sampada 2 portal's list of service providers, Nagrik Seva Kendra ranks at the very top — a position among thousands of providers that stands as proof of our hard work and reliability.",
  hi: "संपदा दो के आधिकारिक पोर्टल पर सेवा प्रदाताओं की सूची में नागरिक सेवा केंद्र सबसे आगे स्थान पर है — हज़ारों सेवा प्रदाताओं में से यह स्थान हमारी मेहनत और विश्वसनीयता का प्रमाण है।",
};

const HONESTY_TITLE: Bi = {
  en: "Honesty and Transparency — Our Biggest Promise",
  hi: "ईमानदारी और पारदर्शिता — हमारा सबसे बड़ा वादा",
};
const HONESTY_BODY: Bi = {
  en: "Whether you are a farmer or any other client, we do every piece of work with full transparency. Every detail is explained openly, every fee is made clear upfront — nothing hidden, no deception. We hold no greed for money and tolerate no corruption of any kind. At every step, you are asked and told everything.",
  hi: "चाहे आप एक किसान हों या कोई भी ग्राहक — हम हर काम पूरी पारदर्शिता के साथ करते हैं। हर जानकारी खुलकर बताई जाती है, हर शुल्क पहले से स्पष्ट किया जाता है — कोई छुपाव नहीं, कोई धोखा नहीं। हमारे यहाँ पैसों का कोई लालच नहीं और किसी भी प्रकार का भ्रष्टाचार नहीं। हर कदम पर आपको सब कुछ पूछा और बताया जाता है।",
};

const TEAM_TITLE: Bi = {
  en: "Our Team — Trained, Experienced, and Trustworthy",
  hi: "हमारी टीम — प्रशिक्षित, अनुभवी, और भरोसेमंद",
};
const TEAM_BODY: Bi = {
  en: "Our team includes highly trained and qualified staff — both women and men — who are fully skilled in property documentation.",
  hi: "हमारी टीम में उच्च प्रशिक्षित और योग्य कर्मचारी शामिल हैं — महिला और पुरुष दोनों — जो संपत्ति दस्तावेज़ीकरण में पूरी तरह दक्ष हैं।",
};

const SPEED_TITLE: Bi = { en: "Quick and Prompt Service", hi: "त्वरित और तीव्र सेवा" };
const SPEED_BODY: Bi = {
  en: "Nobody likes delays in property-related work. That is why every document is prepared as quickly as possible, without any unnecessary delay.",
  hi: "संपत्ति से जुड़े काम में देरी किसी को पसंद नहीं। इसीलिए हर दस्तावेज़ जल्द से जल्द, बिना किसी अनावश्यक देरी के तैयार किया जाता है।",
};

const HOME_TITLE: Bi = {
  en: "Trust Now Comes to Your Doorstep — Home Service Available",
  hi: "अब भरोसा आपके दरवाज़े तक — गृह सेवा उपलब्ध",
};
const HOME_BODY: Bi = {
  en: "There's no need to visit our office for registration. Our team will come to your home to collect documents, prepare them, and complete the entire signing process on Sampada 2 — all from your doorstep.",
  hi: "रजिस्ट्री के लिए कार्यालय आने की ज़रूरत नहीं। हमारी टीम खुद आपके घर आकर दस्तावेज़ एकत्र करेगी, तैयार करेगी, और संपदा दो पर पूरी हस्ताक्षर प्रक्रिया भी घर से पूर्ण करेगी।",
};
const HOME_DOCS_TITLE: Bi = {
  en: "These Documents Too — No Office Visit Needed",
  hi: "इन दस्तावेज़ों के लिए भी कार्यालय जाने की ज़रूरत नहीं",
};
const HOME_DOCS_BODY: Bi = {
  en: "Documents such as mortgage, re-transfer, lease, power of attorney, and agreements can be fully prepared right from your home.",
  hi: "बंधक, पुनर्हस्तांतरण, पट्टा, मुख़्तारनामा, और अनुबंध जैसे दस्तावेज़ पूरी तरह आपके घर से तैयार किए जा सकते हैं।",
};

const WHY_TITLE: Bi = {
  en: "Why Thousands of Families and Farmers Choose Nagrik Seva Kendra",
  hi: "क्यों हज़ारों परिवार और किसान भाई चुनते हैं नागरिक सेवा केंद्र?",
};

const WHY_LIST: Bi[] = [
  {
    en: "Over 15 years of experience and unwavering reliability",
    hi: "पंद्रह से अधिक वर्षों का अनुभव और अटूट विश्वसनीयता",
  },
  { en: "Top-ranked service provider on Sampada 2", hi: "संपदा दो पर शीर्ष सेवा प्रदाता" },
  {
    en: "Over 7,000 documents — every one completed successfully",
    hi: "सात हज़ार से अधिक दस्तावेज़ — हर एक सफलतापूर्वक पूर्ण",
  },
  {
    en: "Completely honest, corruption-free service",
    hi: "पूरी तरह ईमानदार और भ्रष्टाचार मुक्त सेवा",
  },
  {
    en: "Special respect and transparency for farmer clients",
    hi: "किसान भाइयों के साथ विशेष सम्मान और पारदर्शिता",
  },
  { en: "Highly trained women and men staff", hi: "उच्च प्रशिक्षित महिला व पुरुष कर्मचारी" },
  {
    en: "Fast, prompt service — work completed without delay",
    hi: "त्वरित और तीव्र सेवा — बिना देरी के काम पूर्ण",
  },
  { en: "Registration from home — home service available", hi: "घर बैठे रजिस्ट्री — गृह सेवा उपलब्ध" },
  {
    en: "Mortgage, lease, power of attorney, agreements — without visiting the office",
    hi: "बंधक, पट्टा, मुख़्तारनामा, अनुबंध — बिना कार्यालय गए",
  },
  {
    en: "Personal experience and guidance of Mr. Rajesh Kumar Sharma",
    hi: "श्री राजेश कुमार शर्मा जी का व्यक्तिगत अनुभव और मार्गदर्शन",
  },
];

const CLOSING: Bi = {
  en: "Your property, our responsibility. Trust Nagrik Seva Kendra — because fifteen years of experience isn't built overnight.",
  hi: "आपकी संपत्ति, हमारी ज़िम्मेदारी। नागरिक सेवा केंद्र पर भरोसा कीजिए — क्योंकि पंद्रह साल का अनुभव यूं ही नहीं बनता।",
};

export function OurStory() {
  const lang = useLang();

  return (
    <section className="story">
      <div className="wrap">
        <h2>{HEADING[lang]}</h2>
        <p className="story-intro">{INTRO[lang]}</p>

        <div className="about-stats" style={{ marginBottom: 34 }}>
          {STATS.map((s) => (
            <div className="about-stat" key={s.value}>
              <div className="about-stat-value">{s.value}</div>
              <div className="about-stat-label">{s.label[lang]}</div>
            </div>
          ))}
        </div>

        <h3 className="er-section" style={{ marginTop: 0 }}>
          {STORY_TITLE[lang]}
        </h3>
        <p className="deed-about">{STORY_BODY[lang]}</p>

        <ul className="er-steps">
          {TIMELINE.map((t) => (
            <li className="er-step" key={t.year}>
              <span className="er-num">{t.year.slice(2)}</span>
              <div>
                <div className="er-step-title">{t.year}</div>
                <p className="er-step-desc">{t.text[lang]}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="deed-about" style={{ marginTop: 20 }}>
          {TOP_PROVIDER[lang]}
        </p>

        <h3 className="er-section">{HONESTY_TITLE[lang]}</h3>
        <p className="deed-about">{HONESTY_BODY[lang]}</p>

        <h3 className="er-section">{TEAM_TITLE[lang]}</h3>
        <p className="deed-about">{TEAM_BODY[lang]}</p>

        <h3 className="er-section">{SPEED_TITLE[lang]}</h3>
        <p className="deed-about">{SPEED_BODY[lang]}</p>

        <h3 className="er-section">{HOME_TITLE[lang]}</h3>
        <p className="deed-about">{HOME_BODY[lang]}</p>

        <h3 className="er-section">{HOME_DOCS_TITLE[lang]}</h3>
        <p className="deed-about">{HOME_DOCS_BODY[lang]}</p>

        <h3 className="er-section">{WHY_TITLE[lang]}</h3>
        <ul className="er-docs">
          {WHY_LIST.map((item, i) => (
            <li key={i}>
              <span className="er-check">✓</span>
              {item[lang]}
            </li>
          ))}
        </ul>

        <div className="er-note">
          <p>
            <strong>{CLOSING[lang]}</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
