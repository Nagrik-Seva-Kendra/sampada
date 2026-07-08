// Classify a legacy deed into one of the 11 new DeedType slugs by keyword.
// The legacy data has no type column, so we infer from the deed name.
// First match wins; order = most specific → most generic.
const RULES = [
  ["reconveyance-deed", ["बंधक मुक्ति", "बन्धक मुक्ति", "बंधक मुक्ती", "मुक्ति विलेख", "मुक्ति पत्र", "reconvey", "redemption"]],
  ["equitable-mortgage-deed", ["बंधक", "बन्धक", "गिरवी", "mortgage", "equitable", "hypothec"]],
  ["power-of-attorney", ["पॉवर ऑफ अटार्नी", "पावर ऑफ अटार्नी", "पावर ऑफ अटॉर्नी", "पावर ऑफ अटानी", "मुख्तारनामा", "मुख्तार नामा", "power of attorney", "poa", "attorney"]],
  ["will-deed", ["वसीयत", "वसीयतनामा", "इच्छा पत्र", "इच्छापत्र", "इच्‍छा पत्र", "will"]],
  ["release-deed", ["हक त्याग", "हकत्याग", "हक-त्याग", "हक़ त्याग", "त्याग पत्र", "त्यागपत्र", "release", "relinquish"]],
  ["gift-deed", ["दान पत्र", "दानपत्र", "दान विलेख", "दान-पत्र", "gift", "भेंट"]],
  ["partition-deed", ["बंटवारा", "बटवारा", "बँटवारा", "विभाजन", "बंटन", "partition"]],
  ["amendment-deed", ["संसोधन", "संशोधन", "शुद्धि पत्र", "शुद्धिपत्र", "amendment", "correction", "rectification"]],
  ["lease-deed", ["लीज", "किराया", "किरायानामा", "किराया नामा", "पट्टा", "lease", "rent", "tenancy"]],
  ["agreement", ["अनुबंध", "अनुबन्ध", "इकरारनामा", "इकरार नामा", "सहमति पत्र", "सहमति-पत्र", "करारनामा", "agreement", "contract", "mou"]],
  ["sale-deed", ["विक्रय", "री सेल", "रीसेल", "री-सेल", "रि सेल", "रि-सेल", "बैनामा", "बयनामा", "sale", "resell", "resale", "sell", "बिक्री", "सेल"]],
];

export function classify(name) {
  const s = (name || "").toLowerCase();
  for (const [type, kws] of RULES) {
    for (const kw of kws) if (s.includes(kw.toLowerCase())) return type;
  }
  return "sale-deed"; // default: the dominant category
}
