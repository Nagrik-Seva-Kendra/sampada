/**
 * Everyday customer questions answered straight away (customer-faq.spec.ts):
 * "गवाह कितने लगेंगे", "mahila ke naam chhoot", "vasiyat banwani hai",
 * "geo tag kya hai". A question the bot cannot answer goes to the office and
 * the customer is told so -- never the bare menu. Pure; the figures are the
 * same ones the cost estimate uses (wa-smart.ts, guideline-chat.ts).
 */
import { normDigits } from "./intake-rules.js";
import { geoTagConfig } from "./registry-flow.js";

export interface FaqAnswer {
  topic: string;
  text: string;
  /** Owner alert (a lead or a question staff must answer); the caller adds the number. */
  alert?: string;
}

const clean = (t: string) => normDigits(t).toLowerCase().replace(/\s+/g, " ").trim();

const OTHER_DOCS: [RegExp, string][] = [
  [/वसीयत|vasiyat|wasiyat|vasiyatnama|वसीयतनामा|\bwill (deed|banw|bana)/i, "वसीयत"],
  [/दान\s*पत्र|दानपत्र|daan\s*patra?|dan\s*patra?|gift\s*deed|हिबा|hiba/i, "दान पत्र"],
  [/मुख्तारनामा|मुख्त्यारनामा|mukhtarnama|mukhtiyarnama|mukhtyarnama|power of attorney|\bpoa\b/i, "मुख्तारनामा (पावर ऑफ़ अटॉर्नी)"],
  [/इकरारनामा|ikrarnama|iqrarnama|अनुबंध|anubandh|\bagreement\b|एग्रीमेंट/i, "इकरारनामा / अनुबंध"],
  [/किरायानामा|kirayanama|rent agreement|किराया अनुबंध/i, "किरायानामा"],
  [/बँटवारा|बंटवारा|batwara|bantwara|partition/i, "बँटवारा पत्र"],
  [/हक\s*त्याग|हक़\s*त्याग|hak\s*tyag|haq\s*tyag|release deed|relinquish/i, "हक़ त्याग पत्र"],
  [/शपथ\s*पत्र|affidavit|halafnama|हलफनामा/i, "शपथ पत्र"],
];
const FAMILY = /भाई|bhai|बहन|behen|bahan|बेटे|बेटा|beta|bete|बेटी|beti|पत्नी|patni|wife|पति|pati|husband|मां|माँ|maa|mummy|पापा|papa|पिता|pita|father|mother|son|daughter|brother|sister|परिवार|parivar|family/i;
const TRANSFER = /ट्रांसफर|transfer|नाम\s*(करना|करनी|करवाना|करवानी|कर|चढ़)|naam\s*(karna|karni|karwana|karwani|kar|chadh)|नाम पर|naam par|naam pe|नाम करनी|देनी है|deni hai|देना है|dena hai/i;

const WITNESS = /गवाह|gawah|gavah|gwah|gawaah|witness/i;
const WOMAN = /महिला|mahila|पत्नी|patni|wife|बेटी|beti|पुत्री|मां के नाम|माँ के नाम|maa ke naam|mother|women|woman|lady|ladies|female|औरत|aurat|स्त्री/i;
const CHEAPER = /छूट|chhoot|chhut|chut|choot|सस्त|sast|कम\s*(लग|पड|होत)|kam\s*(lag|pad|hot)|less|discount|concession|फ़ायदा|फायदा|fayda|faida|benefit|cheap|फीस|fees?\b|शुल्क|shulk|खर्च|kharch|stamp|स्टाम्प|स्टांप|duty|ड्यूटी|registration|पंजीयन/i;
const RATE_WORD = /स्टाम्प|स्टांप|stamp|ड्यूटी|duty|पंजीयन शुल्क|panjiyan|registration (fee|charge)|रजिस्ट्रेशन फीस/i;
const RATE_ASK = /कितन|kitn|प्रतिशत|percent|%|rate|रेट|how much|kya hai|क्या है|kitni|lagti|लगती|लगता|lagta/i;
const HOW_LONG = /कितने दिन|kitne din|कितना समय|kitna samay|कितना टाइम|kitna time|time lag|टाइम लग|samay lag|समय लग|how long|how many days|कितनी देर|kitni der|जल्दी हो|jaldi ho/i;
const IN_PERSON = /ऑफिस आना|ऑफ़िस आना|office aana|office ana|आना पड़ेगा|आना पडेगा|aana padega|ana padega|aana hoga|आना होगा|घर से|ghar se|घर बैठे|ghar baithe|in person|खुद आना|khud aana|khud ana|जाना पड़ेगा|jana padega|हाज़िर|हाजिर|उपस्थित|without (coming|visit)|बिना आए|bina aaye/i;
const GEO = /जियो|जिओ|geo\s*-?\s*tag|geotag|जियोटैग/i;
const ID_DOC = /आधार|aadhar|aadhaar|adhar|aadhar card|पैन|\bpan\b|pan card|पहचान पत्र|id proof|identity/i;
const ID_ASK = /ज़रूरी|जरूरी|zaroori|jaruri|zaruri|chahiye|चाहिए|nahi hai|नहीं है|nhi hai|lagega|लगेगा|लगेंगे|lagenge|required|need|mandatory|बिना|bina|without|kiska|किसका|किसके/i;
const PAYMENT = /payment|पेमेंट|भुगतान|bhugtan|cheque|चेक से|चैक|\bcash\b|कैश|नकद|nakad|\bupi\b|यूपीआई|online pay|पैसे कैसे|paise kaise|कैसे जमा|kaise jama|डीडी|\bdd\b|draft se pay/i;
const SLOT = /स्लॉट|slot|appointment|अपॉइंटमेंट|ऑनलाइन रजिस्ट्री|online registry|online registri|संपदा|sampada|e-?registry|ई-रजिस्ट्री/i;
const CANCEL_DONE = /(रजिस्ट्री|registry|registri|बैनामा|bainama).*(रद्द|radd|cancel|निरस्त|nirast|वापस|wapas|vapas)|(रद्द|radd|cancel|निरस्त|nirast|वापस|wapas|vapas).*(रजिस्ट्री|registry|registri|बैनामा|bainama)/i;
const QUESTION_HINT = /\?|क्या|\bkya|\bkyaa|सकत|sakt|होगा|hoga|होगी|hogi|कैसे|kaise|\bkese|\bcan\b|\bis\b/i;
/** "guideline kya hoti hai": explained, then the guideline questions start. */
export const isGuideMeaning = (text: string): boolean => GUIDE_MEANING.test(clean(text));
export const GUIDE_MEANING_TEXT =
  "गाइडलाइन (कलेक्टर दर) सरकार की तय की हुई संपत्ति की न्यूनतम कीमत है। स्टाम्प शुल्क गाइडलाइन मूल्य और रजिस्ट्री राशि में से जो ज़्यादा हो, उस पर लगता है।";
const GUIDE_MEANING = /(गाइडलाइन|guideline|guide line|कलेक्टर दर|collector rate).*(क्या (होती|होता|है)|kya (hoti|hota|hai)|matlab|मतलब|what is|meaning)|(what is|meaning of).*(guideline|collector rate)/i;
const KHASRA = /खसरा|khasra|खतौनी|khatauni|नक्शा|naksha|bhulekh|भूलेख|b-?1\b|बी-?1/i;
const OWNER_WORD = /seller|सेलर|विक्रेता|बेचने वाल|bechne wal|मालिक|malik|owner|जिसके नाम|jiske naam|पिता|पापा|papa|father|dada|दादा|दादी|dadi|नाना|nana|ससुर|sasur|पति|pati|husband|मां|माँ|maa|mother/i;
const DIED = /\bmar (gay|gaye|gai|chuk)|मर (गय|गए|गई|चुक)|मृत्यु|mrityu|death|देहांत|dehant|dehaant|निधन|nidhan|expire|guzar|गुज़र|गुजर|स्वर्गवास|swargwas|nahi rahe|नहीं रहे|died|passed away|\bdead\b/i;
const PROPERTY_WORD = /registry|registri|रजिस्ट्री|property|प्रॉपर्टी|संपत्ति|sampatti|zameen|jameen|ज़मीन|जमीन|makan|मकान|plot|प्लॉट|ghar|घर|naam|नाम|बेच|bech/i;
const KHASRA_ASK = /कहाँ|कहां|kahan|kaha\b|kaise|कैसे|milega|मिलेगा|milegi|मिलेगी|nikal|निकल|where|how/i;

const otherDoc = (s: string): string | null => {
  for (const [re, name] of OTHER_DOCS) if (re.test(s)) return name;
  return FAMILY.test(s) && TRANSFER.test(s) ? "परिवार में संपत्ति नाम करना (दान पत्र / हक़ त्याग / विक्रय पत्र)" : null;
};

/** A fixed answer to an everyday question; null when the text is not one. */
export function faqAnswer(text: string): FaqAnswer | null {
  const s = clean(text);
  if (s.length < 3) return null;

  // The owner's answer: a dead seller's heirs first get the mutation (about 30-40 days), then they sign the registry.
  if (DIED.test(s) && (OWNER_WORD.test(s) || PROPERTY_WORD.test(s))) {
    return {
      topic: "seller-died",
      text:
        "संपत्ति के मालिक (विक्रेता) का देहांत हो गया हो तो पहले उनके कानूनी वारिसों (legal heirs) के नाम नामांतरण (mutation) करवाना होगा। " +
        "नामांतरण में लगभग 30-40 दिन लगते हैं। उसके बाद वारिस मिलकर रजिस्ट्री कर सकेंगे।\n" +
        "मृत्यु प्रमाण पत्र और पुरानी रजिस्ट्री की फ़ोटो यहीं भेज दें — हमारा स्टाफ नामांतरण में मदद करेगा। कार्यालय फ़ोन: 78984 75648",
      alert: "विक्रेता के देहांत के बाद नामांतरण / रजिस्ट्री के लिए पूछ रहे हैं",
    };
  }
  const doc = otherDoc(s);
  if (doc) {
    return {
      topic: "other-doc",
      text:
        `जी हाँ, हम ${doc} भी बनाते हैं। 📝\n` +
        "संपत्ति के कागज़ (पुरानी रजिस्ट्री) और पक्षकारों के आधार की फ़ोटो यहीं भेज दें — हमारा स्टाफ आपसे बात करके सही तरीका और खर्च बताएगा।\n" +
        "कार्यालय फ़ोन: 78984 75648",
      alert: `${doc} के लिए पूछ रहे हैं`,
    };
  }
  if (WITNESS.test(s)) {
    return {
      topic: "witness",
      text: "रजिस्ट्री में 2 गवाह लगते हैं। दोनों बालिग हों और रजिस्ट्री के दिन अपना मूल आधार कार्ड साथ लाएँ। गवाह कोई भी जान-पहचान वाला व्यक्ति हो सकता है।",
    };
  }
  if (WOMAN.test(s) && CHEAPER.test(s)) {
    return {
      topic: "woman",
      text:
        "जी हाँ, महिला के नाम रजिस्ट्री पर पंजीयन शुल्क कम लगता है:\n" +
        "• केवल महिला क्रेता: पंजीयन शुल्क 1%\n" +
        "• पुरुष या संयुक्त नाम: पंजीयन शुल्क 3%\n" +
        "स्टाम्प शुल्क जगह के हिसाब से लगता है (नगर निगम क्षेत्र 9.5%, अन्य क्षेत्र 6.5%)।\n" +
        "अपनी राशि का पूरा अनुमान: राशि लिखें, जैसे 20 लाख।",
    };
  }
  if (RATE_WORD.test(s) && RATE_ASK.test(s)) {
    return {
      topic: "rates",
      text:
        "रजिस्ट्री का सरकारी शुल्क (गाइडलाइन मूल्य और रजिस्ट्री राशि में जो ज़्यादा हो उस पर):\n" +
        "• स्टाम्प शुल्क: नगर निगम क्षेत्र 9.5%, अन्य क्षेत्र 6.5%\n" +
        "• पंजीयन शुल्क: 3% (केवल महिला क्रेता 1%)\n" +
        "अपनी राशि का पूरा अनुमान: राशि लिखें, जैसे 20 लाख।",
    };
  }
  if (GEO.test(s)) {
    const g = geoTagConfig();
    return {
      topic: "geotag",
      text:
        "संपदा 2.0 में रजिस्ट्री के लिए संपत्ति की जियो-टैग फ़ोटो (जगह के निशान वाली फ़ोटो) ज़रूरी है।\n" +
        `• खुद: संपत्ति पर खड़े होकर संपदा 2.0 ऐप से फ़ोटो लें${g.appUrl ? ` (${g.appUrl})` : ""}\n` +
        `• या हमारा स्टाफ आकर ले लेगा: ₹${g.fee} प्रति फ़ोटो — संपर्क ${g.contact}`,
    };
  }
  if (CANCEL_DONE.test(s) && QUESTION_HINT.test(s)) {
    return {
      topic: "registry-cancel",
      text:
        "हो चुकी रजिस्ट्री में गलती का सुधार संशोधन विलेख (correction deed) से होता है; रजिस्ट्री रद्द करने के लिए निरस्तीकरण विलेख या कोर्ट का रास्ता होता है — यह मामले पर निर्भर है।\n" +
        "हमारा स्टाफ आपसे बात करके बताएगा। कार्यालय फ़ोन: 78984 75648",
      alert: "हो चुकी रजिस्ट्री रद्द / सुधार के बारे में पूछ रहे हैं",
    };
  }
  if (HOW_LONG.test(s)) {
    return {
      topic: "how-long",
      text:
        "• ड्राफ्ट: पूरे कागज़ मिलने के बाद स्टाफ बनाकर आपको जाँच के लिए यहीं भेजता है।\n" +
        "• रजिस्ट्री: संपदा पोर्टल पर स्लॉट (तारीख-समय) बुक होता है; उसी दिन पंजीयन कार्यालय में रजिस्ट्री हो जाती है और कॉपी मिल जाती है।\n" +
        'आपके काम की स्थिति देखने के लिए "3" लिखें।',
    };
  }
  if (IN_PERSON.test(s)) {
    return {
      topic: "in-person",
      text:
        "• ड्राफ्ट के लिए ऑफिस आना ज़रूरी नहीं — कागज़ की फ़ोटो / PDF यहीं WhatsApp पर भेज दें।\n" +
        "• रजिस्ट्री के दिन क्रेता, विक्रेता और 2 गवाहों को पंजीयन कार्यालय में खुद आना होता है (फ़ोटो और अंगूठा वहीं लगता है)।",
    };
  }
  if (ID_DOC.test(s) && ID_ASK.test(s)) {
    return {
      topic: "id",
      text:
        "• क्रेता और विक्रेता: मूल आधार कार्ड और PAN कार्ड\n" +
        "• दोनों गवाह: मूल आधार कार्ड\n" +
        "PAN न हो तो फ़ॉर्म 60 भरकर काम हो जाता है — स्टाफ बता देगा।",
    };
  }
  if (PAYMENT.test(s)) {
    return {
      topic: "payment",
      text: "स्टाम्प और पंजीयन शुल्क संपदा पोर्टल पर सरकार के खाते में ऑनलाइन (या चैक से) जमा होता है। कितना और कैसे जमा करना है, स्टाफ ड्राफ्ट के समय बता देगा।",
    };
  }
  if (SLOT.test(s)) {
    return {
      topic: "slot",
      text:
        "रजिस्ट्री संपदा 2.0 पोर्टल से होती है। ड्राफ्ट तैयार होने के बाद हमारा स्टाफ पोर्टल पर स्लॉट (तारीख-समय) बुक करता है; उस दिन सभी पक्षकार पंजीयन कार्यालय जाते हैं।\n" +
        'ड्राफ्ट शुरू करने के लिए "1" लिखें।',
    };
  }
  if (KHASRA.test(s) && KHASRA_ASK.test(s) && !/पास|pass|स्वीकृत|swikrit|approv|मंज़ूर|मंजूर|manjoor/i.test(s)) {
    return {
      topic: "khasra",
      text: "खसरा / खतौनी / नक्शा की प्रति MP भूलेख पोर्टल से या तहसील से मिलती है। चाहें तो हमारा स्टाफ निकलवा देगा — 4 लिखें।",
    };
  }
  return null;
}

const ASK_ONLY =
  /^(sir |सर |ji |जी |hello |hi |नमस्ते |namaste )*(mujhe |मुझे |hume |हमें )?(ek |एक )?(sawal|सवाल|swal|question|baat|बात|jankari|जानकारी)\s*(puchna|पूछना|poochna|puchni|पूछनी|batao|बताओ|bataiye|बताइए|chahiye|चाहिए|hai|है|tha|था|lena|लेना|leni|लेनी)?\s*(hai|है|tha|था|thi|थी)?[\s?!.।]*$/i;
/** "मुझे एक सवाल पूछना है" with no question in it yet. */
export const asksToAsk = (text: string): boolean => ASK_ONLY.test(clean(text).replace(/^(sir|सर|ji|जी|hello|hi|नमस्ते|namaste)[\s,]+/i, ""));
export const ASK_AWAY = "जी ज़रूर, अपना सवाल लिखें या बोलकर (voice) भेजें। 🙏";

const Q_WORD =
  /\?|क्या|कैसे|कितन|कब|क्यों|कहाँ|कहां|कौन|सकत|मिलेग|होगा|होगी|चलेगा|\b(kya|kyaa|kaise|kese|kitn\w*|kab|kyon|kyu|kyun|kahan|kaha|kaun|sakt\w*|milega|milegi|hoga|hogi|chalega|what|how|when|why|where|which|can|could|is|are|do|does|will)\b/i;
/** A real question (not "hi", not a single word) the bot had no answer for. */
export function looksLikeQuestion(text: string): boolean {
  const s = clean(text);
  return s.length >= 8 && s.split(" ").length >= 2 && Q_WORD.test(s);
}
export const QUESTION_FORWARDED =
  "🙏 आपका सवाल हमारे स्टाफ को भेज दिया है — जल्द ही यहीं जवाब मिलेगा।\n" +
  "तब तक: 1 ड्राफ्ट, 2 खर्च / गाइडलाइन, 3 मेरा काम, 4 स्टाफ से बात। कार्यालय फ़ोन: 78984 75648";
