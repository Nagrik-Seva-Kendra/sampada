/**
 * Filling a deed from uploaded papers must never empty anything out: a part
 * nobody uploaded for keeps what it has, and a written value is never turned
 * back into a blank. Nor may it get a relation wrong -- "पत्नी" for "पुत्री"
 * describes a different family. These are the last checks before an edit is
 * offered.
 */
import { describe, expect, it } from "vitest";
import {
  chosenSigners,
  leftoverIdentifiers,
  matchAadhaarStyle,
  parseDocumentRole,
  parseOrganisations,
  MAX_MESSAGE_CHARS,
  parseMessage,
  parsePickedPeople,
  parseSingleFact,
  relationMismatch,
  resolveMimeType,
  splitPaperParties,
  wouldEmpty,
} from "./deed-source-documents.service.js";

describe("leftoverIdentifiers", () => {
  // Shaped like the live Flora deed: a firm sells, a person buys.
  const deed = [
    "विक्रेता पक्ष -मैसर्स ग्रीन इन्फ्राटेक (Pan No. AALFG0860B) द्वारा पार्टनर",
    "श्री महेश भारद्वाज (आ.नं. XXXX XXXX 1716)",
    "",
    "क्रेता पक्ष - श्रीमती हेमलता सोनी पत्नी श्री अनुराग सोनी (आ.नं. 9196 2100 7554) (पेन. नं. EWOPS5262J)",
    "निवासी - 27/30 लखेरा गली, ग्वालियर",
    "",
    "यह कि, इस विक्रय पत्र में ...",
  ].join("\n");
  const newBuyer = deed
    .replace("श्रीमती हेमलता सोनी पत्नी श्री अनुराग सोनी", "श्रीमती सुनीता वर्मा पत्नी श्री अजय वर्मा")
    .replace("9196 2100 7554", "6630 2215 9874")
    .replace("27/30 लखेरा गली", "44, गोविन्दपुरी");
  const cardWithoutPan = [
    { label: "नाम", value: "सुनीता वर्मा", group: "party" as const },
    { label: "आधार नं.", value: "6630 2215 9874", group: "party" as const },
  ];

  it("flags the previous buyer's PAN the new card did not replace", () => {
    expect(leftoverIdentifiers(deed, newBuyer, "buyer", cardWithoutPan)).toEqual(["EWOPS5262J"]);
  });

  it("is quiet when the new paperwork supplied that PAN", () => {
    const withPan = newBuyer.replace("EWOPS5262J", "BXQPV1234K");
    const card = [...cardWithoutPan, { label: "पैन नं.", value: "BXQPV1234K", group: "party" as const }];
    expect(leftoverIdentifiers(deed, withPan, "buyer", card)).toEqual([]);
  });

  it("flags an old Aadhaar that was not replaced", () => {
    const nameOnly = deed.replace("श्रीमती हेमलता सोनी", "श्रीमती सुनीता वर्मा");
    expect(leftoverIdentifiers(deed, nameOnly, "buyer", [{ label: "नाम", value: "सुनीता वर्मा", group: "party" }])).toEqual([
      "EWOPS5262J",
      "9196 2100 7554",
    ]);
  });

  it("says nothing about a side that was not changed", () => {
    expect(leftoverIdentifiers(deed, newBuyer, "seller", [])).toEqual([]);
  });

  it("does not count a masked Aadhaar as a number", () => {
    const sellerSwap = deed.replace("श्री महेश भारद्वाज", "श्री राजीव गुप्ता");
    expect(leftoverIdentifiers(deed, sellerSwap, "seller", [])).toEqual(["AALFG0860B"]);
  });
});

describe("matchAadhaarStyle", () => {
  it("masks a full number where the deed writes XXXX XXXX", () => {
    expect(
      matchAadhaarStyle(
        "1. श्री प्रमोद शर्मा (आ.नं. XXXX XXXX 7439)",
        "1. श्री राजीव गुप्ता (आ.नं. 3301 4455 7702)",
      ),
    ).toBe("1. श्री राजीव गुप्ता (आ.नं. XXXX XXXX 7702)");
  });

  it("masks every number in a multi-person entry", () => {
    const out = matchAadhaarStyle("(आ.नं. XXXX XXXX ........)", "1. (आ.नं. 330144557702) 2. (आ.नं. 3301-4455-8816)");
    expect(out).toBe("1. (आ.नं. XXXX XXXX 7702) 2. (आ.नं. XXXX XXXX 8816)");
  });

  it("leaves numbers alone where the deed writes them in full", () => {
    expect(matchAadhaarStyle("(आ.नं. 4841 4400 0011)", "(आ.नं. 6630 2215 9874)")).toBe("(आ.नं. 6630 2215 9874)");
  });

  it("does not touch longer numbers such as a CLR number", () => {
    expect(matchAadhaarStyle("XXXX XXXX", "CLR No. 25029477310")).toBe("CLR No. 25029477310");
  });
});

describe("parseOrganisations", () => {
  it("marks only the sides said to be an organisation", () => {
    expect(parseOrganisations({ seller: "organisation", buyer: "individual" })).toEqual({ seller: true, buyer: false });
  });

  it("treats anything unexpected as a person", () => {
    expect(parseOrganisations({ seller: "company", buyer: true })).toEqual({ seller: false, buyer: false });
    expect(parseOrganisations(null)).toEqual({ seller: false, buyer: false });
  });
});

describe("parsePickedPeople", () => {
  it("reads seller and buyer id lists", () => {
    expect(parsePickedPeople({ seller: ["a", "b"], buyer: ["c"] })).toEqual({ seller: ["a", "b"], buyer: ["c"] });
  });

  it("drops anything that is not an id, and anything missing", () => {
    expect(parsePickedPeople({ seller: ["a", 5, "", null, { id: "x" }] })).toEqual({ seller: ["a"], buyer: [] });
    expect(parsePickedPeople(undefined)).toEqual({ seller: [], buyer: [] });
    expect(parsePickedPeople("seller")).toEqual({ seller: [], buyer: [] });
  });

  it("caps how many can be sent", () => {
    const many = Array.from({ length: 50 }, (_, i) => `p${i}`);
    expect(parsePickedPeople({ seller: many }).seller).toHaveLength(10);
  });

  it("reads which partners sign for a picked firm, and ignores firms not picked", () => {
    expect(
      parsePickedPeople({ seller: ["green"], signers: { green: ["rohit", "ayush", 7], other: ["x"] } }),
    ).toEqual({ seller: ["green"], buyer: [], signers: { green: ["rohit", "ayush"] } });
    expect(parsePickedPeople({ seller: ["green"], signers: ["rohit"] })).toEqual({ seller: ["green"], buyer: [] });
  });
});

describe("parseSingleFact", () => {
  it("reads one fact to place on its own", () => {
    expect(parseSingleFact({ role: "buyer", label: "नाम", value: " श्रीमती नेहा कुमारी " })).toEqual({
      role: "buyer",
      label: "नाम",
      value: "श्रीमती नेहा कुमारी",
    });
  });

  it("means 'fill everything' when anything is off", () => {
    expect(parseSingleFact(undefined)).toBeUndefined();
    expect(parseSingleFact({ role: "witness", label: "नाम", value: "x" })).toBeUndefined();
    expect(parseSingleFact({ role: "buyer", label: "नाम", value: "  " })).toBeUndefined();
    expect(parseSingleFact({ role: "buyer", label: "नाम", value: "x".repeat(401) })).toBeUndefined();
  });
});

describe("splitPaperParties", () => {
  const agreement = [
    { label: "नाम", value: "श्री जयदेव शर्मा", group: "party" as const, side: "seller" as const },
    { label: "नाम", value: "श्री आशीष अग्रवाल", group: "party" as const, side: "buyer" as const },
    { label: "पिता का नाम", value: "श्री जवाहर लाल", group: "party" as const, side: "buyer" as const },
    { label: "फ्लैट नं.", value: "204", group: "property" as const },
  ];

  it("lets an agreement fill the sides that have no ID", () => {
    const r = splitPaperParties({ seller: [], buyer: [], property: agreement });
    expect(r.byRole.seller.map((f) => f.value)).toEqual(["श्री जयदेव शर्मा"]);
    expect(r.byRole.buyer.map((f) => f.value)).toEqual(["श्री आशीष अग्रवाल", "श्री जवाहर लाल"]);
    expect(r.byRole.property.map((f) => f.value)).toEqual(["204"]);
  });

  it("keeps an uploaded ID in charge of its own side", () => {
    const card = [{ label: "नाम", value: "श्रीमती नेहा कुमारी", group: "party" as const }];
    const r = splitPaperParties({ seller: [], buyer: card, property: agreement });
    expect(r.byRole.buyer).toEqual(card);
    expect(r.openSides).toEqual(["seller"]);
  });

  it("holds people whose side the paper did not give, to be matched against the deed", () => {
    const old = agreement.map(({ side: _side, ...f }) => f);
    const r = splitPaperParties({ seller: [], buyer: [], property: old });
    expect(r.unsorted).toHaveLength(3);
    expect(r.byRole.seller).toEqual([]);
    expect(r.openSides).toEqual(["seller", "buyer"]);
  });

  it("holds nothing back when both sides have their own IDs", () => {
    const id = [{ label: "नाम", value: "x", group: "party" as const }];
    const r = splitPaperParties({ seller: id, buyer: id, property: agreement });
    expect(r.unsorted).toEqual([]);
    expect(r.byRole.seller).toEqual(id);
  });
});

describe("parseMessage", () => {
  it("keeps a typed message, trimmed and capped", () => {
    expect(parseMessage("  प्लॉट नं. C-27 करो ")).toBe("प्लॉट नं. C-27 करो");
    expect(parseMessage("क".repeat(5000))).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it("means no message for blanks and non-text", () => {
    expect(parseMessage("   ")).toBeUndefined();
    expect(parseMessage(42)).toBeUndefined();
    expect(parseMessage(undefined)).toBeUndefined();
  });
});

describe("chosenSigners", () => {
  const members = [{ personId: "ayush" }, { personId: "mahesh" }, { personId: "rohit" }];

  it("takes only the chosen partners, in the order chosen", () => {
    expect(chosenSigners(members, ["rohit", "ayush"])).toEqual([{ personId: "rohit" }, { personId: "ayush" }]);
  });

  it("takes all of them when nothing was said", () => {
    expect(chosenSigners(members, undefined)).toEqual(members);
  });

  it("drops an id that is no longer the firm's partner", () => {
    expect(chosenSigners(members, ["gone", "mahesh"])).toEqual([{ personId: "mahesh" }]);
  });
});

describe("resolveMimeType", () => {
  it("keeps a type the browser got right", () => {
    expect(resolveMimeType("application/pdf", "khasra.pdf")).toBe("application/pdf");
    expect(resolveMimeType("image/png", "aadhaar.png")).toBe("image/png");
  });

  it("recognises a dragged PDF sent without a proper type", () => {
    expect(resolveMimeType("application/octet-stream", "B1 Khasra.PDF")).toBe("application/pdf");
    expect(resolveMimeType("", "rin-pustika.pdf")).toBe("application/pdf");
    expect(resolveMimeType(undefined, "card.JPG")).toBe("image/jpeg");
  });

  it("normalises the old jpg spellings", () => {
    expect(resolveMimeType("image/jpg", "x")).toBe("image/jpeg");
  });

  it("leaves a type it cannot read as it is", () => {
    expect(resolveMimeType("image/heic", "IMG_0001.HEIC")).toBe("image/heic");
    expect(resolveMimeType("", "notes.docx")).toBe("application/octet-stream");
  });
});

describe("relationMismatch", () => {
  const husband = [{ label: "पति का नाम", value: "अजय वर्मा", group: "party" as const }];
  const father = [{ label: "पिता का नाम", value: "श्री रामदयाल अग्रवाल", group: "party" as const }];

  it("catches a husband written as a father", () => {
    // The mistake that prompted this check, word for word.
    expect(relationMismatch("श्रीमती सुनीता वर्मा पुत्री श्री अजय वर्मा", husband)).toBe(true);
    expect(relationMismatch("श्री सुनील पुत्र अजय वर्मा", husband)).toBe(true);
  });

  it("accepts a husband written as a husband", () => {
    expect(relationMismatch("श्रीमती सुनीता वर्मा पत्नी श्री अजय वर्मा", husband)).toBe(false);
  });

  it("sees through the zero-width joiners deeds are full of", () => {
    expect(relationMismatch("श्रीमती सुनीता वर्मा पत्\u200dनी श्री अजय वर्मा", husband)).toBe(false);
    expect(relationMismatch("पत्\u200dनी श्री रामदयाल अग्रवाल", father)).toBe(true);
  });

  it("catches a father written as a husband, honorific or not", () => {
    expect(relationMismatch("श्रीमती आशा पत्नी श्री रामदयाल अग्रवाल", father)).toBe(true);
    expect(relationMismatch("श्री आनंद कुमार पुत्र श्री रामदयाल अग्रवाल", father)).toBe(false);
  });

  it("ignores names the edit does not mention", () => {
    expect(relationMismatch("निवासी - 44, गोविन्दपुरी, ग्वालियर", husband)).toBe(false);
  });
});

describe("wouldEmpty", () => {
  it("allows filling a dotted blank", () => {
    expect(wouldEmpty("क्रेता पक्ष - ........", "क्रेता पक्ष - श्रीमती सुनीता वर्मा")).toBe(false);
  });

  it("allows filling one of two blanks in the same line", () => {
    expect(
      wouldEmpty("ग्राम ........, तहसील ........", "ग्राम बेहटा, तहसील ........"),
    ).toBe(false);
  });

  it("allows replacing an old party's name in a copied deed", () => {
    expect(wouldEmpty("श्रीमती दीपा जैन पत्नी श्री राहुल जैन", "श्रीमती सुनीता वर्मा पत्नी श्री अजय वर्मा")).toBe(false);
  });

  it("refuses to turn a written name back into dots", () => {
    expect(wouldEmpty("श्री ओतारसिंह पुत्र श्री बालाराम", "श्री ........ पुत्र श्री बालाराम")).toBe(true);
  });

  it("refuses angle-bracket and underscore placeholders too", () => {
    expect(wouldEmpty("निवासी - बेहटा", "निवासी - <पता>")).toBe(true);
    expect(wouldEmpty("निवासी - बेहटा", "निवासी - ______")).toBe(true);
  });

  it("refuses an empty replacement", () => {
    expect(wouldEmpty("विक्रेता - श्री महेश", "   ")).toBe(true);
  });
});

describe("parseDocumentRole", () => {
  it("accepts the three slots", () => {
    expect(parseDocumentRole("seller")).toBe("seller");
    expect(parseDocumentRole("buyer")).toBe("buyer");
    expect(parseDocumentRole("property")).toBe("property");
  });

  it("rejects anything else rather than guessing", () => {
    expect(() => parseDocumentRole(undefined)).toThrow();
    expect(() => parseDocumentRole("Seller")).toThrow();
  });
});
