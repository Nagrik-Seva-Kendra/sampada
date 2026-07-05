import type { Language } from "@sampada/shared";

/**
 * Bilingual string dictionary (EN / Hindi). Drive UI copy from keys, never
 * duplicated DOM. Devanagari falls back to Noto Sans Devanagari (see theme.css).
 */
export const strings = {
  phone: { en: "78984 75648", hi: "78984 75648" },
  email: { en: "anujshrm325@gmail.com", hi: "anujshrm325@gmail.com" },
  login: { en: "Login", hi: "लॉगिन" },
  dark: { en: "Dark", hi: "डार्क" },
  light: { en: "Light", hi: "लाइट" },

  brandName: { en: "Nagrik Seva Kendra", hi: "नागरिक सेवा केंद्र" },
  brandSub: { en: "Guideline Rates · Deeds", hi: "गाइडलाइन दरें · विलेख" },

  navHome: { en: "Home", hi: "होम" },
  navGuideline: { en: "Guideline Rates", hi: "गाइडलाइन दरें" },
  navDeeds: { en: "All Deeds", hi: "सभी विलेख" },
  partnerWithUs: { en: "Partner With Us", hi: "हमारे साथ जुड़ें" },

  heroKicker: {
    en: "Official guideline rates · 51 districts",
    hi: "सरकारी गाइडलाइन दरें · 51 जिले",
  },
  heroTitle: {
    en: "Official guideline rates & property deeds — in one trusted portal.",
    hi: "सरकारी गाइडलाइन दरें और संपत्ति विलेख — एक विश्वसनीय पोर्टल पर।",
  },
  heroSub: {
    en: "Find official collector guideline rates for every district and understand every major deed — clearly and bilingually.",
    hi: "हर जिले के लिए सरकारी कलेक्टर गाइडलाइन दरें पाएँ और हर प्रमुख विलेख को समझें — स्पष्ट और द्विभाषी।",
  },

  captionTitle: { en: "Verified property records", hi: "सत्यापित संपत्ति रिकॉर्ड" },
  captionValued: { en: "2.4L+ records", hi: "2.4L+ रिकॉर्ड" },

  servicesTitle: {
    en: "Everything you need for property & registry",
    hi: "संपत्ति और रजिस्ट्री के लिए सब कुछ",
  },
  svcGuideline: { en: "Guideline Rates", hi: "गाइडलाइन दरें" },
  svcGuidelineDesc: { en: "Official rates 2016–2020.", hi: "सरकारी दरें 2016–2020।" },
  svcDeeds: { en: "Deeds & Instruments", hi: "विलेख व दस्तावेज़" },
  svcDeedsDesc: {
    en: "Sale, lease, partition & more — explained.",
    hi: "विक्रय, पट्टा, विभाजन व अन्य — सरल भाषा में।",
  },
  svcDeed: { en: "Deed Management", hi: "डीड प्रबंधन" },
  svcDeedDesc: {
    en: "Create, print & manage deeds.",
    hi: "डीड बनाएं, प्रिंट करें और प्रबंधित करें।",
  },

  glGuidelinePdfs: { en: "Guideline rate PDFs", hi: "गाइडलाइन दर पीडीएफ" },
  glView: { en: "View", hi: "देखें" },
  glDownload: { en: "Download", hi: "डाउनलोड" },
  glDelete: { en: "Delete", hi: "हटाएं" },
  glUploadFor: { en: "Upload guideline PDF for", hi: "गाइडलाइन पीडीएफ अपलोड करें —" },
  glDistrict: { en: "District", hi: "जिला" },
  glAllDistricts: { en: "All districts", hi: "सभी जिले" },
  glUploadBtn: { en: "Upload PDF", hi: "पीडीएफ अपलोड करें" },
  glOnlyPdf: { en: "PDF files only.", hi: "केवल पीडीएफ फ़ाइलें।" },
  glNoPdfs: { en: "No guideline PDF uploaded for this year yet.", hi: "इस वर्ष के लिए अभी तक कोई गाइडलाइन पीडीएफ अपलोड नहीं हुआ।" },
  glAdminNote: { en: "Uploading is admin-only.", hi: "अपलोड केवल एडमिन के लिए।" },
  glUploadFailed: { en: "Upload failed — please try again.", hi: "अपलोड विफल — पुनः प्रयास करें।" },
  authEmail: { en: "Email", hi: "ईमेल" },
  authPassword: { en: "Password", hi: "पासवर्ड" },
  authLogin: { en: "Login", hi: "लॉगिन" },
  authLogout: { en: "Logout", hi: "लॉगआउट" },
  authInvalid: { en: "Invalid email or password.", hi: "ईमेल या पासवर्ड गलत है।" },
  authSignedInAs: { en: "Signed in as", hi: "साइन इन:" },
  inboxLink: { en: "Inbox", hi: "इनबॉक्स" },
  inboxTitle: { en: "Contact messages", hi: "संपर्क संदेश" },
  inboxEmpty: { en: "No messages yet.", hi: "अभी तक कोई संदेश नहीं।" },
  inboxError: { en: "Could not load messages.", hi: "संदेश लोड नहीं हो सके।" },

  // Deeds
  deedsTitle: { en: "Deeds & instruments", hi: "विलेख व दस्तावेज़" },
  deedsSubtitle: {
    en: "The major registrable instruments in Madhya Pradesh — what each deed does, when to use it, and the documents you'll need.",
    hi: "मध्य प्रदेश के प्रमुख पंजीकरण-योग्य दस्तावेज़ — प्रत्येक विलेख क्या करता है, कब उपयोग होता है, और कौन से दस्तावेज़ लगेंगे।",
  },
  deedsDocsHead: { en: "Documents you'll need", hi: "आवश्यक दस्तावेज़" },
  deedsStampNote: {
    en: "Stamp duty and registration fees follow the current MP schedule and the collector guideline value for your district.",
    hi: "स्टाम्प शुल्क व पंजीकरण फीस वर्तमान म.प्र. अनुसूची और आपके जिले के कलेक्टर गाइडलाइन मूल्य के अनुसार होती है।",
  },
  deedsBackAll: { en: "← All deeds", hi: "← सभी विलेख" },
  viewRates: { en: "View guideline rates", hi: "गाइडलाइन दरें देखें" },

  // Deed register (create/list deeds; role-scoped)
  navMyDeeds: { en: "My All Deeds", hi: "मेरी सभी डीड" },
  navPartnerDeeds: { en: "All Partner Deeds", hi: "सभी पार्टनर डीड" },
  drNew: { en: "New deed", hi: "नई डीड" },
  drType: { en: "Deed type", hi: "डीड प्रकार" },
  drDeedTitle: { en: "Title / parties", hi: "शीर्षक / पक्षकार" },
  drDistrict: { en: "District (optional)", hi: "जिला (वैकल्पिक)" },
  drNotes: { en: "Notes (optional)", hi: "टिप्पणी (वैकल्पिक)" },
  drCreate: { en: "Add deed", hi: "डीड जोड़ें" },
  drMine: { en: "My deeds", hi: "मेरी डीड" },
  drEmpty: { en: "No deeds yet.", hi: "अभी कोई डीड नहीं।" },
  drError: { en: "Could not load deeds.", hi: "डीड लोड नहीं हो सकीं।" },
  drSaveFailed: { en: "Could not save — try again.", hi: "सहेजा नहीं जा सका — पुनः प्रयास करें।" },
  drDelete: { en: "Delete", hi: "हटाएं" },
  drBy: { en: "By", hi: "द्वारा" },
  drPartners: { en: "Partners", hi: "पार्टनर्स" },
  drPartnersEmpty: { en: "No partners yet — add one below.", hi: "अभी कोई पार्टनर नहीं — नीचे जोड़ें।" },
  drDeedCount: { en: "deeds", hi: "डीड" },
  drDeedsBy: { en: "Deeds by", hi: "डीड —" },
  drBackPartners: { en: "← Partners", hi: "← पार्टनर्स" },
  drAddPartner: { en: "Add partner", hi: "पार्टनर जोड़ें" },
  drFname: { en: "First name", hi: "प्रथम नाम" },
  drLname: { en: "Last name", hi: "अंतिम नाम" },
  drPartnerCreated: { en: "Partner account created.", hi: "पार्टनर खाता बन गया।" },
  drPartnerFailed: {
    en: "Could not create partner — email may already exist.",
    hi: "पार्टनर नहीं बन सका — ईमेल पहले से मौजूद हो सकता है।",
  },

  footAbout: { en: "About", hi: "परिचय" },
  footPartner: { en: "Partner", hi: "पार्टनर" },
  footContact: { en: "Contact", hi: "संपर्क" },
  footMpigr: { en: "MPIGR", hi: "एमपीआईजीआर" },
  copyright: { en: "© 2026 · Gwalior, M.P.", hi: "© 2026 · ग्वालियर, म.प्र." },

  // About
  aboutTitle: { en: "About Nagrik Seva Kendra", hi: "नागरिक सेवा केंद्र के बारे में" },
  aboutP1: {
    en: "Nagrik Seva Kendra is a citizen-service portal for official guideline rates and property deed information across Madhya Pradesh.",
    hi: "नागरिक सेवा केंद्र मध्य प्रदेश में सरकारी गाइडलाइन दरों और संपत्ति विलेख जानकारी के लिए एक नागरिक सेवा पोर्टल है।",
  },
  aboutP2: {
    en: "We bring official collector guideline rates and every major deed into one trusted, bilingual place — so property registration is faster and clearer for every citizen.",
    hi: "हम सरकारी कलेक्टर गाइडलाइन दरें और हर प्रमुख विलेख को एक विश्वसनीय, द्विभाषी स्थान पर लाते हैं — ताकि हर नागरिक के लिए संपत्ति पंजीकरण तेज़ और स्पष्ट हो।",
  },
  aboutStat1: { en: "Districts covered", hi: "कवर किए गए जिले" },
  aboutStat2: { en: "Guideline years", hi: "गाइडलाइन वर्ष" },
  aboutStat3: { en: "Citizens served", hi: "सेवित नागरिक" },

  // Partner
  partnerTitle: { en: "Partner With Us", hi: "हमारे साथ जुड़ें" },
  partnerP: {
    en: "Join as a registered agent to manage clients and deeds in one place. Partners get faster workflows and district-wide guideline access.",
    hi: "ग्राहकों और डीड को एक स्थान पर प्रबंधित करने के लिए एक पंजीकृत एजेंट के रूप में जुड़ें। पार्टनर्स को तेज़ वर्कफ़्लो और जिला-स्तरीय गाइडलाइन पहुँच मिलती है।",
  },
  partnerB1: { en: "Manage deeds, buyers & sellers", hi: "डीड, क्रेता व विक्रेता प्रबंधित करें" },
  partnerB2: { en: "District-wide guideline rates", hi: "जिला-स्तरीय गाइडलाइन दरें" },
  partnerB3: { en: "Faster registration workflow", hi: "तेज़ पंजीकरण वर्कफ़्लो" },
  partnerCta: { en: "Contact us to partner", hi: "जुड़ने हेतु संपर्क करें" },

  // Contact
  contactTitle: { en: "Contact us", hi: "हमसे संपर्क करें" },
  contactIntro: {
    en: "Questions about guideline rates or registration? Send us a message.",
    hi: "गाइडलाइन दरों या पंजीकरण के बारे में प्रश्न? हमें संदेश भेजें।",
  },
  contactName: { en: "Your name", hi: "आपका नाम" },
  contactEmail: { en: "Email", hi: "ईमेल" },
  contactPhone: { en: "Phone (optional)", hi: "फ़ोन (वैकल्पिक)" },
  contactMessage: { en: "Message", hi: "संदेश" },
  contactSend: { en: "Send message", hi: "संदेश भेजें" },
  contactSent: { en: "Thanks — your message has been sent.", hi: "धन्यवाद — आपका संदेश भेज दिया गया है।" },
  contactError: { en: "Could not send — please try again.", hi: "भेजा नहीं जा सका — पुनः प्रयास करें।" },
  contactReach: { en: "Reach us", hi: "हमसे संपर्क" },
  contactAddress: { en: "Gwalior, Madhya Pradesh", hi: "ग्वालियर, मध्य प्रदेश" },
} as const;

export type StringKey = keyof typeof strings;

export function translate(key: StringKey, lang: Language): string {
  return strings[key][lang];
}
