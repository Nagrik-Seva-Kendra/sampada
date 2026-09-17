/**
 * A saved firm carries the people who act for it, and brings them into a deed
 * in the shape the document reader uses for a partnership deed.
 */
import { describe, expect, it } from "vitest";
import { memberFacts, parseDesignation, type FirmMember } from "./party-members.service.js";

const ayush: FirmMember = {
  personId: "a",
  name: "श्री आयुष लाधा पुत्र श्री कृष्ण गोपाल लाधा",
  designation: "पार्टनर",
  position: 0,
  aadhaarNumber: "608565774879",
  panNumber: null,
  address: "बी-17, राजेन्द्र प्रसाद कॉलोनी, ग्वालियर",
};
const mahesh: FirmMember = {
  personId: "m",
  name: "श्री महेश भारद्वाज पुत्र स्व.श्री मुन्नालाल भारद्वाज",
  designation: "पार्टनर",
  position: 1,
  aadhaarNumber: null,
  panNumber: null,
  address: null,
};

describe("memberFacts", () => {
  it("lists each signatory as a name / designation pair with their own numbers, in order", () => {
    expect(memberFacts([mahesh, ayush])).toEqual([
      { label: "अधिकृत व्यक्ति", value: ayush.name, group: "party" },
      { label: "पद", value: "पार्टनर", group: "party" },
      { label: "आधार नं.", value: "6085 6577 4879", group: "party" },
      { label: "पता", value: ayush.address, group: "party" },
      { label: "अधिकृत व्यक्ति", value: mahesh.name, group: "party" },
      { label: "पद", value: "पार्टनर", group: "party" },
    ]);
  });

  it("gives nothing for a firm with nobody on file", () => {
    expect(memberFacts([])).toEqual([]);
  });
});

describe("parseDesignation", () => {
  it("defaults to पार्टनर", () => {
    expect(parseDesignation(undefined)).toBe("पार्टनर");
    expect(parseDesignation("")).toBe("पार्टनर");
  });

  it("accepts the designations deeds use", () => {
    expect(parseDesignation("डायरेक्टर")).toBe("डायरेक्टर");
  });

  it("refuses anything else", () => {
    expect(() => parseDesignation("CEO")).toThrow();
  });
});
