import type { Language } from "@sampada/shared";

/** Bilingual text pair, same shape as i18n/strings entries. */
export type L = Record<Language, string>;

/** Labels for one side of a deed's two named parties, e.g. "Sellers"/"seller" for a sale deed. */
export interface PartyRoleLabel {
  /** Section header on the upload panel — plural, e.g. "Sellers" / "विक्रेता". */
  plural: L;
  /** Used inline in "add as ___" / "already added — ___" — e.g. "seller" / "विक्रेता". */
  singular: L;
}

/** The two named-party roles tracked on a deed's document-upload panel. Storage still uses
 * "seller"/"buyer" as the underlying role keys regardless of deed type — only the labels change. */
export interface DeedPartyLabels {
  seller: PartyRoleLabel;
  buyer: PartyRoleLabel;
}

export interface DeedInfo {
  slug: string;
  name: L;
  /** One-line card tagline. */
  tagline: L;
  /** Party-role labels for the upload panel's Sellers/Buyers-equivalent section.
   * Falls back to Seller/Buyer (via partyLabelsFor) when omitted. */
  partyLabels?: DeedPartyLabels;
}

/** Default labels — used for Sale Deed and any type without a more fitting pair. */
const DEFAULT_PARTY_LABELS: DeedPartyLabels = {
  seller: { plural: { en: "Sellers", hi: "विक्रेता" }, singular: { en: "seller", hi: "विक्रेता" } },
  buyer: { plural: { en: "Buyers", hi: "खरीददार" }, singular: { en: "buyer", hi: "खरीददार" } },
};

/** "First Party"/"Second Party" — the generic pair for deed types without a natural seller/buyer-like asymmetry. */
const PARTY_1_2_LABELS: DeedPartyLabels = {
  seller: { plural: { en: "First Parties", hi: "प्रथम पक्ष" }, singular: { en: "first party", hi: "प्रथम पक्ष" } },
  buyer: { plural: { en: "Second Parties", hi: "द्वितीय पक्ष" }, singular: { en: "second party", hi: "द्वितीय पक्ष" } },
};

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
    partyLabels: {
      seller: { plural: { en: "Releasors", hi: "हक त्यागकर्ता" }, singular: { en: "releasor", hi: "हक त्यागकर्ता" } },
      buyer: { plural: { en: "Releasees", hi: "हक प्राप्तकर्ता" }, singular: { en: "releasee", hi: "हक प्राप्तकर्ता" } },
    },
  },
  {
    slug: "partition-deed",
    name: { en: "Partition Deed", hi: "विभाजन विलेख" },
    tagline: {
      en: "Divide jointly-held property among co-owners.",
      hi: "संयुक्त संपत्ति का सह-स्वामियों में बंटवारा।",
    },
    partyLabels: PARTY_1_2_LABELS,
  },
  {
    slug: "equitable-mortgage-deed",
    name: { en: "Mortgage Deed", hi: "बंधक विलेख" },
    tagline: {
      en: "Pledge property title as loan security.",
      hi: "ऋण की जमानत के रूप में संपत्ति स्वामित्व गिरवी।",
    },
    partyLabels: {
      seller: { plural: { en: "Mortgagors", hi: "बंधककर्ता" }, singular: { en: "mortgagor", hi: "बंधककर्ता" } },
      buyer: { plural: { en: "Mortgagees", hi: "बंधकदार" }, singular: { en: "mortgagee", hi: "बंधकदार" } },
    },
  },
  {
    slug: "lease-deed",
    name: { en: "Lease Deed", hi: "पट्टा विलेख" },
    tagline: {
      en: "Grant use of property for a term against rent.",
      hi: "किराए के बदले निश्चित अवधि हेतु संपत्ति उपयोग।",
    },
    partyLabels: {
      seller: { plural: { en: "Lessors", hi: "पट्टाकर्ता" }, singular: { en: "lessor", hi: "पट्टाकर्ता" } },
      buyer: { plural: { en: "Lessees", hi: "पट्टेदार" }, singular: { en: "lessee", hi: "पट्टेदार" } },
    },
  },
  {
    slug: "power-of-attorney",
    name: { en: "Power of Attorney", hi: "मुख्तारनामा" },
    tagline: {
      en: "Authorize someone to act on your behalf.",
      hi: "अपनी ओर से कार्य करने हेतु किसी को अधिकृत करें।",
    },
    partyLabels: {
      seller: { plural: { en: "Appointers", hi: "नियुक्तकर्ता" }, singular: { en: "appointer", hi: "नियुक्तकर्ता" } },
      buyer: { plural: { en: "Attorney-holders", hi: "ग्रहिता" }, singular: { en: "attorney-holder", hi: "ग्रहिता" } },
    },
  },
  {
    slug: "will-deed",
    name: { en: "Will Deed", hi: "वसीयत" },
    tagline: {
      en: "Direct how your property is distributed after death.",
      hi: "मृत्यु के बाद संपत्ति के बंटवारे हेतु निर्देश।",
    },
    partyLabels: {
      seller: { plural: { en: "Testators", hi: "वसीयतकर्ता" }, singular: { en: "testator", hi: "वसीयतकर्ता" } },
      buyer: { plural: { en: "Beneficiaries", hi: "लाभार्थी" }, singular: { en: "beneficiary", hi: "लाभार्थी" } },
    },
  },
  {
    slug: "gift-deed",
    name: { en: "Gift Deed", hi: "दान विलेख" },
    tagline: {
      en: "Transfer property to someone voluntarily, without payment.",
      hi: "बिना किसी भुगतान के स्वेच्छा से संपत्ति किसी को हस्तांतरित करना।",
    },
    partyLabels: {
      seller: { plural: { en: "Donors", hi: "दानकर्ता" }, singular: { en: "donor", hi: "दानकर्ता" } },
      buyer: { plural: { en: "Donees", hi: "दानग्रहीता" }, singular: { en: "donee", hi: "दानग्रहीता" } },
    },
  },
  {
    slug: "agreement",
    name: { en: "Agreement", hi: "अनुबंध" },
    tagline: {
      en: "Record terms agreed between parties (e.g. agreement to sell).",
      hi: "पक्षों के बीच सहमत शर्तों को दर्ज करना (जैसे विक्रय अनुबंध)।",
    },
    partyLabels: PARTY_1_2_LABELS,
  },
  {
    slug: "reconveyance-deed",
    name: { en: "Reconveyance Deed", hi: "पुनर्हस्तांतरण विलेख" },
    tagline: {
      en: "Transfer mortgaged property back to the owner once the loan is repaid.",
      hi: "ऋण चुकाए जाने पर बंधक संपत्ति स्वामी को वापस हस्तांतरित करना।",
    },
    partyLabels: {
      seller: { plural: { en: "Mortgagees", hi: "बंधकदार" }, singular: { en: "mortgagee", hi: "बंधकदार" } },
      buyer: { plural: { en: "Owners", hi: "स्वामी" }, singular: { en: "owner", hi: "स्वामी" } },
    },
  },
  {
    slug: "amendment-deed",
    name: { en: "Amendment Deed", hi: "संशोधन विलेख" },
    tagline: {
      en: "Correct or modify the terms of a previously registered deed.",
      hi: "पूर्व में पंजीकृत विलेख की शर्तों में सुधार या संशोधन करना।",
    },
    partyLabels: PARTY_1_2_LABELS,
  },
  {
    slug: "consent-deed",
    name: { en: "Consent Deed", hi: "राजीनामा (सहमति विलेख)" },
    tagline: {
      en: "Record mutual consent between parties to settle a dispute or claim.",
      hi: "विवाद या दावे को सुलझाने हेतु पक्षों के बीच आपसी सहमति दर्ज करना।",
    },
    partyLabels: PARTY_1_2_LABELS,
  },
  {
    slug: "exchange-deed",
    name: { en: "Exchange Deed", hi: "विनिमय विलेख" },
    tagline: {
      en: "Swap properties between two parties instead of a sale.",
      hi: "बिक्री के बजाय दो पक्षों के बीच संपत्तियों की अदला-बदली।",
    },
    partyLabels: PARTY_1_2_LABELS,
  },
  {
    slug: "settlement-deed",
    name: { en: "Settlement Deed", hi: "व्यवस्थापन विलेख" },
    tagline: {
      en: "Distribute property among family members by mutual settlement, outside inheritance.",
      hi: "उत्तराधिकार से अलग, आपसी सहमति से परिवार के सदस्यों में संपत्ति का बंटवारा।",
    },
    partyLabels: {
      seller: { plural: { en: "Settlors", hi: "व्यवस्थापक" }, singular: { en: "settlor", hi: "व्यवस्थापक" } },
      buyer: { plural: { en: "Beneficiaries", hi: "लाभार्थी" }, singular: { en: "beneficiary", hi: "लाभार्थी" } },
    },
  },
  {
    slug: "cancellation-deed",
    name: { en: "Cancellation Deed", hi: "निरसन विलेख" },
    tagline: {
      en: "Cancel a previously registered deed that both parties no longer wish to honour.",
      hi: "पूर्व में पंजीकृत विलेख को रद्द करना जिसे दोनों पक्ष अब मान्य नहीं रखना चाहते।",
    },
    partyLabels: PARTY_1_2_LABELS,
  },
  {
    slug: "adoption-deed",
    name: { en: "Adoption Deed", hi: "दत्तक ग्रहण विलेख" },
    tagline: {
      en: "Legally record the adoption of a child.",
      hi: "किसी बच्चे को कानूनी रूप से गोद लेने का दस्तावेज़ीकरण।",
    },
    partyLabels: {
      seller: { plural: { en: "Giving Parents", hi: "दत्तक देने वाले" }, singular: { en: "giving parent", hi: "दत्तक देने वाले" } },
      buyer: { plural: { en: "Adoptive Parents", hi: "दत्तक ग्रहण करने वाले" }, singular: { en: "adoptive parent", hi: "दत्तक ग्रहण करने वाले" } },
    },
  },
  {
    slug: "trust-deed",
    name: { en: "Trust Deed", hi: "न्यास विलेख" },
    tagline: {
      en: "Set up a trust and define how its property is managed.",
      hi: "न्यास (ट्रस्ट) की स्थापना और उसकी संपत्ति के प्रबंधन का निर्धारण।",
    },
    partyLabels: {
      seller: { plural: { en: "Settlors", hi: "न्यास-स्थापक" }, singular: { en: "settlor", hi: "न्यास-स्थापक" } },
      buyer: { plural: { en: "Trustees", hi: "न्यासी" }, singular: { en: "trustee", hi: "न्यासी" } },
    },
  },
];

export function findDeed(slug: string): DeedInfo | undefined {
  return DEEDS.find((d) => d.slug === slug);
}

/** Party-role labels for a deed type's document-upload panel — falls back to Seller/Buyer for an
 * unknown slug or a deed type without a more fitting pair. */
export function partyLabelsFor(slug: string): DeedPartyLabels {
  return findDeed(slug)?.partyLabels ?? DEFAULT_PARTY_LABELS;
}
