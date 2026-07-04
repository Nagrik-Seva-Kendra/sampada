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
  brandSub: { en: "Guideline Rates · e-Registry", hi: "गाइडलाइन दरें · ई-रजिस्ट्री" },

  navHome: { en: "Home", hi: "होम" },
  navGuideline: { en: "Guideline Rates", hi: "गाइडलाइन दरें" },
  navEregistry: { en: "e-Registry", hi: "ई-रजिस्ट्री" },
  partnerWithUs: { en: "Partner With Us", hi: "हमारे साथ जुड़ें" },

  heroKicker: {
    en: "Official guideline rates · 51 districts",
    hi: "सरकारी गाइडलाइन दरें · 51 जिले",
  },
  heroTitle: {
    en: "Official guideline rates & e-registry — in one trusted portal.",
    hi: "सरकारी गाइडलाइन दरें और ई-रजिस्ट्री — एक विश्वसनीय पोर्टल पर।",
  },
  heroSub: {
    en: "Find official collector guideline rates for every district and register your property end-to-end — clearly and bilingually.",
    hi: "हर जिले के लिए सरकारी कलेक्टर गाइडलाइन दरें पाएँ और अपनी संपत्ति का संपूर्ण पंजीकरण करें — स्पष्ट और द्विभाषी।",
  },

  captionTitle: { en: "Verified property records", hi: "सत्यापित संपत्ति रिकॉर्ड" },
  captionValued: { en: "2.4L+ records", hi: "2.4L+ रिकॉर्ड" },

  servicesTitle: {
    en: "Everything you need for property & registry",
    hi: "संपत्ति और रजिस्ट्री के लिए सब कुछ",
  },
  svcGuideline: { en: "Guideline Rates", hi: "गाइडलाइन दरें" },
  svcGuidelineDesc: { en: "Official rates 2016–2020.", hi: "सरकारी दरें 2016–2020।" },
  svcEregistry: { en: "e-Registry", hi: "ई-रजिस्ट्री" },
  svcEregistryDesc: {
    en: "Track registration & slots.",
    hi: "पंजीकरण और स्लॉट ट्रैक करें।",
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
  authLogin: { en: "Admin login", hi: "एडमिन लॉगिन" },
  authLogout: { en: "Logout", hi: "लॉगआउट" },
  authInvalid: { en: "Invalid email or password.", hi: "ईमेल या पासवर्ड गलत है।" },
  authSignedInAs: { en: "Signed in as", hi: "साइन इन:" },
  inboxLink: { en: "Inbox", hi: "इनबॉक्स" },
  inboxTitle: { en: "Contact messages", hi: "संपर्क संदेश" },
  inboxEmpty: { en: "No messages yet.", hi: "अभी तक कोई संदेश नहीं।" },
  inboxError: { en: "Could not load messages.", hi: "संदेश लोड नहीं हो सके।" },

  erTitle: { en: "e-Registry process", hi: "ई-रजिस्ट्री प्रक्रिया" },
  erSubtitle: {
    en: "Register your property end-to-end — from guideline rates to a stamped, registered deed.",
    hi: "अपनी संपत्ति का संपूर्ण पंजीकरण — गाइडलाइन दरों से लेकर स्टाम्पित, पंजीकृत डीड तक।",
  },
  erStepsHead: { en: "How it works", hi: "प्रक्रिया कैसे काम करती है" },
  erStep1: { en: "Check guideline value", hi: "गाइडलाइन मूल्य जाँचें" },
  erStep1d: {
    en: "Find the official rate for your location and property type.",
    hi: "अपने स्थान और संपत्ति प्रकार के लिए सरकारी दर पता करें।",
  },
  erStep2: { en: "Prepare the deed", hi: "डीड तैयार करें" },
  erStep2d: {
    en: "Draft the sale/gift/lease deed with buyer & seller details.",
    hi: "क्रेता व विक्रेता विवरण के साथ विक्रय/दान/पट्टा डीड तैयार करें।",
  },
  erStep3: { en: "Pay stamp duty & fees", hi: "स्टाम्प शुल्क व फीस भुगतान" },
  erStep3d: {
    en: "Pay stamp duty and registration fee online.",
    hi: "स्टाम्प शुल्क और पंजीकरण फीस ऑनलाइन भुगतान करें।",
  },
  erStep4: { en: "Book a slot", hi: "स्लॉट बुक करें" },
  erStep4d: {
    en: "Choose a date and time at the Sub-Registrar office.",
    hi: "उप-पंजीयक कार्यालय में तिथि व समय चुनें।",
  },
  erStep5: { en: "Biometric & signing", hi: "बायोमेट्रिक व हस्ताक्षर" },
  erStep5d: {
    en: "Parties and witnesses complete biometrics and sign.",
    hi: "पक्षकार व गवाह बायोमेट्रिक पूर्ण कर हस्ताक्षर करते हैं।",
  },
  erStep6: { en: "Get the registered deed", hi: "पंजीकृत डीड प्राप्त करें" },
  erStep6d: {
    en: "Download your registered deed with the e-registration number.",
    hi: "ई-पंजीकरण संख्या के साथ अपनी पंजीकृत डीड डाउनलोड करें।",
  },
  erDocsHead: { en: "Documents you'll need", hi: "आवश्यक दस्तावेज़" },
  erDoc1: { en: "Buyer & seller ID proof (Aadhaar/PAN)", hi: "क्रेता व विक्रेता पहचान प्रमाण (आधार/पैन)" },
  erDoc2: { en: "Property documents / previous deed", hi: "संपत्ति दस्तावेज़ / पिछली डीड" },
  erDoc3: { en: "Passport-size photographs", hi: "पासपोर्ट आकार की तस्वीरें" },
  erDoc4: { en: "Two witnesses with ID proof", hi: "पहचान प्रमाण सहित दो गवाह" },
  erDoc5: { en: "Stamp duty & fee payment receipt", hi: "स्टाम्प शुल्क व फीस भुगतान रसीद" },
  erNote: {
    en: "Guideline rates and slot availability vary by district. Check the current rate PDFs under Guideline Rates before you begin.",
    hi: "गाइडलाइन दरें और स्लॉट उपलब्धता जिले के अनुसार भिन्न होती हैं। शुरू करने से पहले गाइडलाइन दरें अनुभाग में वर्तमान दर पीडीएफ देखें।",
  },
  erViewRates: { en: "View guideline rates", hi: "गाइडलाइन दरें देखें" },

  footAbout: { en: "About", hi: "परिचय" },
  footPartner: { en: "Partner", hi: "पार्टनर" },
  footContact: { en: "Contact", hi: "संपर्क" },
  footMpigr: { en: "MPIGR", hi: "एमपीआईजीआर" },
  copyright: { en: "© 2026 · Gwalior, M.P.", hi: "© 2026 · ग्वालियर, म.प्र." },

  // About
  aboutTitle: { en: "About Nagrik Seva Kendra", hi: "नागरिक सेवा केंद्र के बारे में" },
  aboutP1: {
    en: "Nagrik Seva Kendra is a citizen-service portal for official guideline rates and end-to-end e-registry across Madhya Pradesh.",
    hi: "नागरिक सेवा केंद्र मध्य प्रदेश में सरकारी गाइडलाइन दरों और संपूर्ण ई-रजिस्ट्री के लिए एक नागरिक सेवा पोर्टल है।",
  },
  aboutP2: {
    en: "We bring official collector guideline rates and deed registration into one trusted, bilingual place — so property registration is faster and clearer for every citizen.",
    hi: "हम सरकारी कलेक्टर गाइडलाइन दरें और डीड पंजीकरण को एक विश्वसनीय, द्विभाषी स्थान पर लाते हैं — ताकि हर नागरिक के लिए संपत्ति पंजीकरण तेज़ और स्पष्ट हो।",
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
