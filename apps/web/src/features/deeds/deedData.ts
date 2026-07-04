import type { Language } from "@sampada/shared";

/** Bilingual text pair, same shape as i18n/strings entries. */
type L = Record<Language, string>;

export interface DeedInfo {
  slug: string;
  name: L;
  /** One-line card tagline. */
  tagline: L;
  /** Intro paragraphs. */
  about: L[];
  /** Typical documents required. */
  docs: L[];
}

/**
 * The major registrable instruments, as categorized on the SAMPADA portal
 * (sampada.mpigr.gov.in). Content is informational; stamp duty & fees follow
 * the current MP schedule on SAMPADA.
 */
export const DEEDS: DeedInfo[] = [
  {
    slug: "sale-deed",
    name: { en: "Sale Deed", hi: "विक्रय विलेख" },
    tagline: {
      en: "Transfer of property ownership against payment.",
      hi: "भुगतान के बदले संपत्ति स्वामित्व का हस्तांतरण।",
    },
    about: [
      {
        en: "A sale deed permanently transfers ownership of a property from the seller to the buyer for an agreed price. It is the most common registered instrument and becomes legally effective only after registration at the Sub-Registrar office.",
        hi: "विक्रय विलेख तय मूल्य के बदले संपत्ति का स्वामित्व विक्रेता से क्रेता को स्थायी रूप से हस्तांतरित करता है। यह सबसे सामान्य पंजीकृत दस्तावेज़ है और उप-पंजीयक कार्यालय में पंजीकरण के बाद ही विधिक रूप से प्रभावी होता है।",
      },
      {
        en: "Stamp duty is calculated on the higher of the transaction value or the collector guideline value of the property.",
        hi: "स्टाम्प शुल्क लेन-देन मूल्य या संपत्ति के कलेक्टर गाइडलाइन मूल्य — दोनों में से जो अधिक हो — पर गणना किया जाता है।",
      },
    ],
    docs: [
      { en: "Buyer & seller ID proof (Aadhaar/PAN)", hi: "क्रेता व विक्रेता पहचान प्रमाण (आधार/पैन)" },
      { en: "Previous title deed / ownership documents", hi: "पिछला स्वामित्व विलेख / स्वामित्व दस्तावेज़" },
      { en: "Khasra / property record & map", hi: "खसरा / संपत्ति अभिलेख व नक्शा" },
      { en: "Two witnesses with ID proof", hi: "पहचान प्रमाण सहित दो गवाह" },
      { en: "Stamp duty & registration fee receipt", hi: "स्टाम्प शुल्क व पंजीकरण फीस रसीद" },
    ],
  },
  {
    slug: "release-deed",
    name: { en: "Release Deed", hi: "हक-त्याग विलेख" },
    tagline: {
      en: "Relinquish your share in a property, usually within family.",
      hi: "संपत्ति में अपना हिस्सा छोड़ना, प्रायः परिवार के भीतर।",
    },
    about: [
      {
        en: "A release (relinquishment) deed is used when a co-owner gives up their share or claim in a property in favour of another co-owner — most commonly between family members after inheritance.",
        hi: "हक-त्याग विलेख तब उपयोग होता है जब कोई सह-स्वामी संपत्ति में अपना हिस्सा या दावा दूसरे सह-स्वामी के पक्ष में छोड़ता है — प्रायः उत्तराधिकार के बाद परिवार के सदस्यों के बीच।",
      },
      {
        en: "Concessional stamp duty often applies when the release is within blood relations; the exact rate follows the current MP schedule.",
        hi: "रक्त-संबंधों के भीतर हक-त्याग पर प्रायः रियायती स्टाम्प शुल्क लागू होता है; सटीक दर वर्तमान म.प्र. अनुसूची के अनुसार होती है।",
      },
    ],
    docs: [
      { en: "ID proof of releasor & releasee", hi: "त्यागकर्ता व लाभार्थी का पहचान प्रमाण" },
      { en: "Proof of co-ownership / inheritance", hi: "सह-स्वामित्व / उत्तराधिकार का प्रमाण" },
      { en: "Original title documents", hi: "मूल स्वामित्व दस्तावेज़" },
      { en: "Relationship proof (for concessional duty)", hi: "संबंध प्रमाण (रियायती शुल्क हेतु)" },
      { en: "Two witnesses with ID proof", hi: "पहचान प्रमाण सहित दो गवाह" },
    ],
  },
  {
    slug: "partition-deed",
    name: { en: "Partition Deed", hi: "विभाजन विलेख" },
    tagline: {
      en: "Divide jointly-held property among co-owners.",
      hi: "संयुक्त संपत्ति का सह-स्वामियों में बंटवारा।",
    },
    about: [
      {
        en: "A partition deed divides jointly owned property among co-owners so that each owner gets a defined, separate share with independent title. After registration, each share can be sold or transferred independently.",
        hi: "विभाजन विलेख संयुक्त स्वामित्व वाली संपत्ति को सह-स्वामियों में इस प्रकार बांटता है कि प्रत्येक स्वामी को स्वतंत्र स्वामित्व के साथ निर्धारित, अलग हिस्सा मिले। पंजीकरण के बाद प्रत्येक हिस्सा स्वतंत्र रूप से बेचा या हस्तांतरित किया जा सकता है।",
      },
    ],
    docs: [
      { en: "ID proof of all co-owners", hi: "सभी सह-स्वामियों का पहचान प्रमाण" },
      { en: "Joint ownership documents", hi: "संयुक्त स्वामित्व दस्तावेज़" },
      { en: "Property map with proposed division", hi: "प्रस्तावित विभाजन सहित संपत्ति नक्शा" },
      { en: "Khasra / revenue records", hi: "खसरा / राजस्व अभिलेख" },
      { en: "Two witnesses with ID proof", hi: "पहचान प्रमाण सहित दो गवाह" },
    ],
  },
  {
    slug: "equitable-mortgage-deed",
    name: { en: "Equitable Mortgage Deed", hi: "साम्यिक बंधक विलेख" },
    tagline: {
      en: "Pledge property title as loan security.",
      hi: "ऋण की जमानत के रूप में संपत्ति स्वामित्व गिरवी।",
    },
    about: [
      {
        en: "An equitable mortgage (mortgage by deposit of title deeds) secures a loan by depositing the property's title documents with the lender — typically a bank. The borrower keeps possession of the property while the loan is repaid.",
        hi: "साम्यिक बंधक (स्वामित्व विलेख जमा द्वारा बंधक) में संपत्ति के स्वामित्व दस्तावेज़ ऋणदाता — प्रायः बैंक — के पास जमा कर ऋण सुरक्षित किया जाता है। ऋण चुकाने तक संपत्ति का कब्ज़ा उधारकर्ता के पास रहता है।",
      },
    ],
    docs: [
      { en: "Borrower ID proof (Aadhaar/PAN)", hi: "उधारकर्ता पहचान प्रमाण (आधार/पैन)" },
      { en: "Original title deeds of the property", hi: "संपत्ति के मूल स्वामित्व विलेख" },
      { en: "Loan sanction letter from the bank", hi: "बैंक से ऋण स्वीकृति पत्र" },
      { en: "Property valuation / guideline value", hi: "संपत्ति मूल्यांकन / गाइडलाइन मूल्य" },
    ],
  },
  {
    slug: "lease-deed",
    name: { en: "Lease Deed", hi: "पट्टा विलेख" },
    tagline: {
      en: "Grant use of property for a term against rent.",
      hi: "किराए के बदले निश्चित अवधि हेतु संपत्ति उपयोग।",
    },
    about: [
      {
        en: "A lease deed grants the right to use a property for a fixed term against rent, without transferring ownership. Leases of one year or more must be registered; stamp duty depends on the term and the rent/premium.",
        hi: "पट्टा विलेख स्वामित्व हस्तांतरित किए बिना, किराए के बदले निश्चित अवधि के लिए संपत्ति के उपयोग का अधिकार देता है। एक वर्ष या अधिक के पट्टे का पंजीकरण अनिवार्य है; स्टाम्प शुल्क अवधि और किराया/प्रीमियम पर निर्भर करता है।",
      },
    ],
    docs: [
      { en: "Lessor & lessee ID proof", hi: "पट्टादाता व पट्टेदार पहचान प्रमाण" },
      { en: "Ownership documents of the lessor", hi: "पट्टादाता के स्वामित्व दस्तावेज़" },
      { en: "Lease terms: period, rent, premium", hi: "पट्टा शर्तें: अवधि, किराया, प्रीमियम" },
      { en: "Two witnesses with ID proof", hi: "पहचान प्रमाण सहित दो गवाह" },
    ],
  },
  {
    slug: "power-of-attorney",
    name: { en: "Power of Attorney", hi: "मुख्तारनामा" },
    tagline: {
      en: "Authorize someone to act on your behalf.",
      hi: "अपनी ओर से कार्य करने हेतु किसी को अधिकृत करें।",
    },
    about: [
      {
        en: "A power of attorney (POA) authorizes another person to act on your behalf — either for all matters (general POA) or for a specific transaction (special POA). A POA relating to immovable property should be registered.",
        hi: "मुख्तारनामा (पावर ऑफ अटॉर्नी) किसी अन्य व्यक्ति को आपकी ओर से कार्य करने के लिए अधिकृत करता है — सभी मामलों हेतु (आम मुख्तारनामा) या किसी विशेष लेन-देन हेतु (खास मुख्तारनामा)। अचल संपत्ति से संबंधित मुख्तारनामे का पंजीकरण कराना चाहिए।",
      },
    ],
    docs: [
      { en: "Principal & attorney ID proof", hi: "प्रधान व मुख्तार का पहचान प्रमाण" },
      { en: "Property details (if property-specific)", hi: "संपत्ति विवरण (यदि संपत्ति-विशेष हो)" },
      { en: "Photographs of both parties", hi: "दोनों पक्षों की तस्वीरें" },
      { en: "Two witnesses with ID proof", hi: "पहचान प्रमाण सहित दो गवाह" },
    ],
  },
];

export function findDeed(slug: string): DeedInfo | undefined {
  return DEEDS.find((d) => d.slug === slug);
}
