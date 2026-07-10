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
  brandSub: {
    en: "G-11,12 Millenium Plaza, University Road,\nGovindpuri, Gwalior, M.P.",
    hi: "G-11,12 मिलेनियम प्लाज़ा, यूनिवर्सिटी रोड,\nगोविंदपुरी, ग्वालियर, म.प्र.",
  },

  navHome: { en: "Home", hi: "होम" },
  navDeeds: { en: "My All Deeds", hi: "मेरे सभी विलेख" },

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
  svcDeed: { en: "Deed Management", hi: "विलेख प्रबंधन" },
  svcDeedDesc: {
    en: "Create, print & manage deeds.",
    hi: "विलेख बनाएं, प्रिंट करें और प्रबंधित करें।",
  },

  authUsername: { en: "Username", hi: "यूज़रनेम" },
  authPassword: { en: "Password", hi: "पासवर्ड" },
  authLogin: { en: "Login", hi: "लॉगिन" },
  authEmployeeLogin: { en: "Employee Login", hi: "कर्मचारी लॉगिन" },
  authAdminLogin: { en: "Admin Login", hi: "एडमिन लॉगिन" },
  authLogout: { en: "Logout", hi: "लॉगआउट" },
  authSignupLink: { en: "New employee? Sign up", hi: "नए कर्मचारी? साइन अप करें" },
  authSignupTitle: { en: "Employee Sign Up", hi: "कर्मचारी साइन अप" },
  authPhone: { en: "Mobile number", hi: "मोबाइल नंबर" },
  authSignupSubmit: { en: "Submit request", hi: "अनुरोध भेजें" },
  authSignupSuccess: {
    en: "Request submitted. You can log in once the admin approves it.",
    hi: "अनुरोध भेजा गया। एडमिन की मंजूरी के बाद आप लॉगिन कर सकेंगे।",
  },
  authBackToLogin: { en: "← Back to login", hi: "← लॉगिन पर वापस जाएं" },
  authSendOtp: { en: "Send code", hi: "कोड भेजें" },
  authResendOtp: { en: "Resend code", hi: "कोड दोबारा भेजें" },
  authOtpSent: { en: "Code sent — check your email.", hi: "कोड भेज दिया गया — अपना ईमेल देखें।" },
  authOtpLabel: { en: "Email verification code", hi: "ईमेल सत्यापन कोड" },
  authOtpPlaceholder: { en: "6-digit code", hi: "6-अंकों का कोड" },
  authOtpFailed: { en: "Couldn't send the code — try again.", hi: "कोड नहीं भेजा जा सका — पुनः प्रयास करें।" },
  authVerifyOtp: { en: "Verify OTP", hi: "OTP सत्यापित करें" },
  authOtpVerified: { en: "Email verified.", hi: "ईमेल सत्यापित हो गया।" },
  authOtpVerifyFailed: { en: "Incorrect or expired code.", hi: "कोड गलत है या समय समाप्त हो गया।" },
  navEmployeeRequests: { en: "Employee Requests", hi: "कर्मचारी अनुरोध" },
  empReqEmpty: { en: "No pending employee signups.", hi: "कोई लंबित कर्मचारी साइन अप नहीं।" },
  reqApprove: { en: "Approve", hi: "स्वीकृत करें" },
  reqReject: { en: "Reject", hi: "अस्वीकार करें" },
  reqRejectConfirm: {
    en: "Reject and delete this signup request?",
    hi: "इस साइन अप अनुरोध को अस्वीकार करके हटाएं?",
  },
  reqRequestedOn: { en: "Requested on", hi: "अनुरोध तिथि" },
  reqActionFailed: { en: "That didn't go through — please retry.", hi: "यह नहीं हुआ — पुनः प्रयास करें।" },
  empViewDetails: { en: "View Details", hi: "विवरण देखें" },
  empHideDetails: { en: "Hide Details", hi: "विवरण छुपाएं" },
  empUsername: { en: "Username", hi: "यूज़रनेम" },
  empPassword: { en: "Password", hi: "पासवर्ड" },
  empShowPassword: { en: "Show password", hi: "पासवर्ड दिखाएं" },
  empHidePassword: { en: "Hide password", hi: "पासवर्ड छुपाएं" },
  empPasswordFailed: {
    en: "Couldn't load the password — please retry.",
    hi: "पासवर्ड लोड नहीं हो सका — पुनः प्रयास करें।",
  },
  reqActiveEmployees: { en: "Active Employees", hi: "सक्रिय कर्मचारी" },
  reqActiveEmpty: { en: "None yet.", hi: "अभी कोई नहीं।" },
  reqDiscontinue: { en: "Discontinue", hi: "सेवा बंद करें" },
  reqReactivate: { en: "Reactivate", hi: "पुनः सक्रिय करें" },
  reqDiscontinueConfirm: {
    en: "Discontinue this account? They won't be able to log in until you reactivate it.",
    hi: "इस खाते की सेवा बंद करें? जब तक आप इसे पुनः सक्रिय न करें, यह लॉगिन नहीं कर सकेगा।",
  },
  reqStatusActive: { en: "Active", hi: "सक्रिय" },
  reqStatusInactive: { en: "Discontinued", hi: "सेवा बंद" },

  // Manage Team (admin)
  navManageTeam: { en: "Manage Team", hi: "टीम प्रबंधन" },
  teamTabRequests: { en: "Requests", hi: "अनुरोध" },
  teamTabUsers: { en: "User Management", hi: "उपयोगकर्ता प्रबंधन" },
  teamCreateUser: { en: "Add User", hi: "+ उपयोगकर्ता जोड़ें" },
  teamUsersCount: { en: "team members", hi: "टीम सदस्य" },
  teamUsersEmpty: { en: "No team members yet.", hi: "अभी कोई टीम सदस्य नहीं।" },
  teamRoleEmployee: { en: "Employee", hi: "कर्मचारी" },
  teamRoleAdmin: { en: "Admin", hi: "एडमिन" },
  addUserTitle: { en: "Add New User", hi: "नया उपयोगकर्ता जोड़ें" },
  addUserRole: { en: "Role", hi: "भूमिका" },
  addUserUsername: { en: "Username (optional)", hi: "यूज़रनेम (वैकल्पिक)" },
  addUserUsernamePlaceholder: {
    en: "Login username — they can set their own later",
    hi: "लॉगिन यूज़रनेम — वे बाद में स्वयं सेट कर सकते हैं",
  },
  addUserSubmit: { en: "Create user", hi: "उपयोगकर्ता बनाएं" },
  addUserSuccess: {
    en: "User created. They can log in with their email/username and password.",
    hi: "उपयोगकर्ता बन गया। वे अपने ईमेल/यूज़रनेम और पासवर्ड से लॉगिन कर सकते हैं।",
  },
  addUserDone: { en: "Done", hi: "हो गया" },
  editUserEdit: { en: "Edit", hi: "संपादित करें" },
  editUserTitle: { en: "Edit User", hi: "उपयोगकर्ता संपादित करें" },
  editUserNewPassword: { en: "New password", hi: "नया पासवर्ड" },
  editUserNewPasswordHint: {
    en: "Leave blank to keep current password",
    hi: "वर्तमान पासवर्ड रखने के लिए खाली छोड़ें",
  },
  editUserSubmit: { en: "Save changes", hi: "परिवर्तन सहेजें" },

  // Deeds
  deedsTitle: { en: "Deeds & instruments", hi: "विलेख व दस्तावेज़" },
  deedsSubtitle: {
    en: "The major registrable instruments in Madhya Pradesh — what each deed does, when to use it, and the documents you'll need.",
    hi: "मध्य प्रदेश के प्रमुख पंजीकरण-योग्य दस्तावेज़ — प्रत्येक विलेख क्या करता है, कब उपयोग होता है, और कौन से दस्तावेज़ लगेंगे।",
  },
  deedsSamplesHead: { en: "Deeds", hi: "विलेख" },
  deedsCreateBtn: { en: "Create New Deed", hi: "नया विलेख बनाएं" },
  deedsActionPlaceholder: { en: "Action", hi: "कार्रवाई" },
  deedsViewDeed: { en: "View Deed", hi: "विलेख देखें" },
  deedsEditDeed: { en: "Edit Deed", hi: "विलेख संपादित करें" },
  deedsNewDeedTitle: { en: "New Deed", hi: "नया विलेख" },
  deedsUntitledTitle: { en: "Untitled deed", hi: "बिना शीर्षक विलेख" },
  deedsTitlePlaceholder: { en: "Enter a title for this deed", hi: "इस विलेख का शीर्षक दर्ज करें" },
  deedsPrintDeed: { en: "Print Deed", hi: "विलेख प्रिंट करें" },
  deedsDeleteDeed: { en: "Delete Deed", hi: "विलेख हटाएं" },
  deedsDeleteTitle: { en: "Delete deed?", hi: "विलेख हटाएं?" },
  deedsDeleteConfirm: {
    en: "This will permanently delete the deed. This cannot be undone.",
    hi: "यह विलेख को स्थायी रूप से हटा देगा। यह पूर्ववत नहीं किया जा सकता।",
  },
  deedsDeleting: { en: "Deleting…", hi: "हटाया जा रहा है…" },
  deedsDeleteFailed: {
    en: "Couldn't delete the deed — please retry.",
    hi: "विलेख हटाया नहीं जा सका — पुनः प्रयास करें।",
  },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  deedsCreateDeedOption: { en: "Create Deed", hi: "विलेख बनाएं" },
  deedsCreateNamePrompt: { en: "Enter deed name", hi: "विलेख का नाम दर्ज करें" },
  deedsActionGroupView: { en: "View", hi: "देखें" },
  deedsActionGroupManage: { en: "Manage", hi: "प्रबंधन" },
  deedsActionGroupPrint: { en: "Print", hi: "प्रिंट" },
  deedsCreateChooseType: { en: "Choose a deed type", hi: "विलेख प्रकार चुनें" },
  deedsCloseTab: { en: "Close tab", hi: "टैब बंद करें" },
  deedsSaved: { en: "Saved.", hi: "सहेजा गया।" },
  deedsColId: { en: "S. No.", hi: "क्र.सं." },
  deedsColDate: { en: "Date", hi: "दिनांक" },
  deedsColName: { en: "Deed Name", hi: "विलेख नाम" },
  deedsColCategory: { en: "Category", hi: "श्रेणी" },
  deedsColStatus: { en: "Status", hi: "स्थिति" },
  deedsColUser: { en: "User", hi: "उपयोगकर्ता" },
  deedsColUpdate: { en: "Update", hi: "अपडेट" },
  deedsSearchPlaceholder: { en: "Search by name…", hi: "नाम से खोजें…" },
  deedsSearchEmpty: { en: "No deeds match your search.", hi: "आपकी खोज से कोई विलेख मेल नहीं खाता।" },
  navAllDeedDetails: { en: "All Deeds", hi: "सभी विलेख" },
  allDeedsKicker: { en: "Deed Management", hi: "विलेख प्रबंधन" },
  allDeedsTitle: { en: "All Deeds", hi: "सभी विलेख" },
  allDeedsSearch: { en: "Search by name or user…", hi: "नाम या उपयोगकर्ता से खोजें…" },
  allDeedsSearchClear: { en: "Clear search", hi: "खोज साफ़ करें" },
  allDeedsTotal: { en: "Total deeds", hi: "कुल विलेख" },
  allDeedsMatches: { en: "Matches", hi: "मिलान" },
  allDeedsFilterType: { en: "Type", hi: "प्रकार" },
  allDeedsFilterAllTypes: { en: "All types", hi: "सभी प्रकार" },
  allDeedsFilterAllStatuses: { en: "All statuses", hi: "सभी स्थितियां" },
  allDeedsFilterAllCreators: { en: "All creators", hi: "सभी निर्माता" },
  allDeedsFilterClear: { en: "Clear filters", hi: "फ़िल्टर साफ़ करें" },
  deedStatusActive: { en: "Active", hi: "सक्रिय" },
  deedStatusInactive: { en: "Inactive", hi: "निष्क्रिय" },
  deedsAction: { en: "Action", hi: "कार्रवाई" },
  pagePrev: { en: "← Previous", hi: "← पिछला" },
  pageNext: { en: "Next →", hi: "अगला →" },
  pageLabel: { en: "Page", hi: "पृष्ठ" },
  deedsContentLabel: { en: "Deed content", hi: "विलेख सामग्री" },
  deedsSave: { en: "Save", hi: "सहेजें" },
  deedsBackAll: { en: "← All deeds", hi: "← सभी विलेख" },

  // Deed register (create/list deeds; role-scoped)
  drEmpty: { en: "No deeds yet.", hi: "अभी कोई विलेख नहीं।" },
  drError: { en: "Could not load deeds.", hi: "विलेख लोड नहीं हो सके।" },
  drLoading: { en: "Loading deed…", hi: "विलेख लोड हो रहा है…" },
  drSaveFailed: { en: "Could not save — try again.", hi: "सहेजा नहीं जा सका — पुनः प्रयास करें।" },
  drBy: { en: "By", hi: "द्वारा" },

  // Employee profile (self-edit)
  navProfile: { en: "My Profile", hi: "मेरी प्रोफाइल" },
  profileTitle: { en: "My Profile", hi: "मेरी प्रोफाइल" },
  profileFname: { en: "First name", hi: "प्रथम नाम" },
  profileLname: { en: "Last name", hi: "अंतिम नाम" },
  profileEmail: { en: "Email", hi: "ईमेल" },
  profileUsername: { en: "Username (for login)", hi: "यूज़रनेम (लॉगिन के लिए)" },
  profileUsernamePlaceholder: { en: "Choose a username", hi: "यूज़रनेम चुनें" },
  profileUsernameHint: {
    en: "Set a username to log in with it instead of your email.",
    hi: "लॉगिन के लिए यूज़रनेम सेट करें (ईमेल की जगह इस्तेमाल होगा)।",
  },
  profileCurrentPassword: { en: "Current password", hi: "मौजूदा पासवर्ड" },
  profilePassword: { en: "New password", hi: "नया पासवर्ड" },
  profileConfirmPassword: { en: "Confirm new password", hi: "नया पासवर्ड दोबारा दर्ज करें" },
  profilePasswordHint: {
    en: "Leave all three password fields blank to keep your current password.",
    hi: "मौजूदा पासवर्ड रखने के लिए तीनों पासवर्ड फ़ील्ड खाली छोड़ें।",
  },
  profilePasswordMismatch: {
    en: "New password and confirm password do not match.",
    hi: "नया पासवर्ड और दोबारा दर्ज किया पासवर्ड मेल नहीं खाते।",
  },
  profileCurrentPasswordRequired: {
    en: "Enter your current password to set a new one.",
    hi: "नया पासवर्ड सेट करने के लिए मौजूदा पासवर्ड दर्ज करें।",
  },
  profileCurrentPasswordWrong: {
    en: "Current password is incorrect.",
    hi: "मौजूदा पासवर्ड गलत है।",
  },
  profilePhotoChange: { en: "Change photo", hi: "फोटो बदलें" },
  profilePhotoFailed: {
    en: "Could not upload photo — try a smaller image.",
    hi: "फोटो अपलोड नहीं हो सकी — छोटी फ़ाइल आज़माएं।",
  },
  profileSave: { en: "Save changes", hi: "बदलाव सहेजें" },
  profileSaved: { en: "Profile updated.", hi: "प्रोफाइल अपडेट हो गई।" },
  profileSaveFailed: {
    en: "Could not save — email may already be in use.",
    hi: "सहेजा नहीं जा सका — ईमेल पहले से उपयोग में हो सकता है।",
  },
  footAbout: { en: "About", hi: "परिचय" },
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

} as const;

export type StringKey = keyof typeof strings;

export function translate(key: StringKey, lang: Language): string {
  return strings[key][lang];
}
