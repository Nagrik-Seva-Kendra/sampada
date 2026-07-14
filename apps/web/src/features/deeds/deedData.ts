import type { Language } from "@sampada/shared";

/** Bilingual text pair, same shape as i18n/strings entries. */
type L = Record<Language, string>;

export interface DeedInfo {
  slug: string;
  name: L;
  /** One-line card tagline. */
  tagline: L;
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
  },
  {
    slug: "release-deed",
    name: { en: "Release Deed", hi: "हक-त्याग विलेख" },
    tagline: {
      en: "Relinquish your share in a property, usually within family.",
      hi: "संपत्ति में अपना हिस्सा छोड़ना, प्रायः परिवार के भीतर।",
    },
  },
  {
    slug: "partition-deed",
    name: { en: "Partition Deed", hi: "विभाजन विलेख" },
    tagline: {
      en: "Divide jointly-held property among co-owners.",
      hi: "संयुक्त संपत्ति का सह-स्वामियों में बंटवारा।",
    },
  },
  {
    slug: "equitable-mortgage-deed",
    name: { en: "Mortgage Deed", hi: "बंधक विलेख" },
    tagline: {
      en: "Pledge property title as loan security.",
      hi: "ऋण की जमानत के रूप में संपत्ति स्वामित्व गिरवी।",
    },
  },
  {
    slug: "lease-deed",
    name: { en: "Lease Deed", hi: "पट्टा विलेख" },
    tagline: {
      en: "Grant use of property for a term against rent.",
      hi: "किराए के बदले निश्चित अवधि हेतु संपत्ति उपयोग।",
    },
  },
  {
    slug: "power-of-attorney",
    name: { en: "Power of Attorney", hi: "मुख्तारनामा" },
    tagline: {
      en: "Authorize someone to act on your behalf.",
      hi: "अपनी ओर से कार्य करने हेतु किसी को अधिकृत करें।",
    },
  },
  {
    slug: "will-deed",
    name: { en: "Will Deed", hi: "वसीयत" },
    tagline: {
      en: "Direct how your property is distributed after death.",
      hi: "मृत्यु के बाद संपत्ति के बंटवारे हेतु निर्देश।",
    },
  },
  {
    slug: "gift-deed",
    name: { en: "Gift Deed", hi: "दान विलेख" },
    tagline: {
      en: "Transfer property to someone voluntarily, without payment.",
      hi: "बिना किसी भुगतान के स्वेच्छा से संपत्ति किसी को हस्तांतरित करना।",
    },
  },
  {
    slug: "agreement",
    name: { en: "Agreement", hi: "अनुबंध" },
    tagline: {
      en: "Record terms agreed between parties (e.g. agreement to sell).",
      hi: "पक्षों के बीच सहमत शर्तों को दर्ज करना (जैसे विक्रय अनुबंध)।",
    },
  },
  {
    slug: "reconveyance-deed",
    name: { en: "Reconveyance Deed", hi: "पुनर्हस्तांतरण विलेख" },
    tagline: {
      en: "Transfer mortgaged property back to the owner once the loan is repaid.",
      hi: "ऋण चुकाए जाने पर बंधक संपत्ति स्वामी को वापस हस्तांतरित करना।",
    },
  },
  {
    slug: "amendment-deed",
    name: { en: "Amendment Deed", hi: "संशोधन विलेख" },
    tagline: {
      en: "Correct or modify the terms of a previously registered deed.",
      hi: "पूर्व में पंजीकृत विलेख की शर्तों में सुधार या संशोधन करना।",
    },
  },
  {
    slug: "consent-deed",
    name: { en: "Consent Deed", hi: "राजीनामा (सहमति विलेख)" },
    tagline: {
      en: "Record mutual consent between parties to settle a dispute or claim.",
      hi: "विवाद या दावे को सुलझाने हेतु पक्षों के बीच आपसी सहमति दर्ज करना।",
    },
  },
  {
    slug: "exchange-deed",
    name: { en: "Exchange Deed", hi: "विनिमय विलेख" },
    tagline: {
      en: "Swap properties between two parties instead of a sale.",
      hi: "बिक्री के बजाय दो पक्षों के बीच संपत्तियों की अदला-बदली।",
    },
  },
  {
    slug: "settlement-deed",
    name: { en: "Settlement Deed", hi: "व्यवस्थापन विलेख" },
    tagline: {
      en: "Distribute property among family members by mutual settlement, outside inheritance.",
      hi: "उत्तराधिकार से अलग, आपसी सहमति से परिवार के सदस्यों में संपत्ति का बंटवारा।",
    },
  },
  {
    slug: "cancellation-deed",
    name: { en: "Cancellation Deed", hi: "निरसन विलेख" },
    tagline: {
      en: "Cancel a previously registered deed that both parties no longer wish to honour.",
      hi: "पूर्व में पंजीकृत विलेख को रद्द करना जिसे दोनों पक्ष अब मान्य नहीं रखना चाहते।",
    },
  },
  {
    slug: "adoption-deed",
    name: { en: "Adoption Deed", hi: "दत्तक ग्रहण विलेख" },
    tagline: {
      en: "Legally record the adoption of a child.",
      hi: "किसी बच्चे को कानूनी रूप से गोद लेने का दस्तावेज़ीकरण।",
    },
  },
  {
    slug: "trust-deed",
    name: { en: "Trust Deed", hi: "न्यास विलेख" },
    tagline: {
      en: "Set up a trust and define how its property is managed.",
      hi: "न्यास (ट्रस्ट) की स्थापना और उसकी संपत्ति के प्रबंधन का निर्धारण।",
    },
  },
];

export function findDeed(slug: string): DeedInfo | undefined {
  return DEEDS.find((d) => d.slug === slug);
}
