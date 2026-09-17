/**
 * For farmland the seller is named as the khasra names them, and an ID that
 * disagrees with the khasra must be flagged before the deed goes anywhere.
 */
import { describe, expect, it } from "vitest";
import { bareName, checkSellerNames, compareNames } from "./seller-name-check.js";

describe("bareName", () => {
  it("drops the honorific and the relation tail", () => {
    expect(bareName("श्री ओतारसिंह पुत्र श्री बालाराम")).toBe("ओतारसिंह");
    expect(bareName("श्रीमती सुनीता वर्मा पत्नी श्री अजय वर्मा")).toBe("सुनीता वर्मा");
    expect(bareName("स्व. श्री रामदयाल")).toBe("रामदयाल");
  });

  it("does not cut श्री off the front of a name that starts with it", () => {
    expect(bareName("श्रीकृष्ण शर्मा")).toBe("श्रीकृष्ण शर्मा");
  });

  it("ignores zero-width joiners and nukta", () => {
    expect(bareName("श्री आनंद\u200d कुमार")).toBe("आनंद कुमार");
  });
});

describe("compareNames", () => {
  it("treats joined and spaced सिंह as the same name", () => {
    expect(compareNames("श्री ओतारसिंह", "ओतार सिंह")).toBe("same");
  });

  it("forgives a one-letter slip in a long name", () => {
    expect(compareNames("निहालसिंह", "निहालसींह")).toBe("same");
  });

  it("calls a surname the khasra leaves out partial, not same", () => {
    expect(compareNames("ओतार सिंह कुशवाह", "ओतारसिंह")).toBe("partial");
  });

  it("calls different people different", () => {
    expect(compareNames("सुनीता वर्मा", "ओतारसिंह")).toBe("different");
    expect(compareNames("राम शर्मा", "राम वर्मा")).toBe("different");
  });

  it("does not match on a two-letter fragment", () => {
    expect(compareNames("रा", "रामस्वरूप")).not.toBe("partial");
  });

  it("treats a firm's name the same however the nasal and suffix are written", () => {
    expect(compareNames("मैसर्स डी राज कंस्ट्रक्शन कम्पनी", "डी राज कंस्ट्रक्शन कंपनी")).toBe("same");
    expect(compareNames("शिवम इन्फ्रा प्रा. लि.", "शिवम इन्फ्रा प्राइवेट लिमिटेड")).toBe("same");
    expect(compareNames("M/S Shivam Infra Pvt. Ltd.", "Shivam Infra Private Limited")).toBe("same");
  });

  it("still tells two firms apart", () => {
    expect(compareNames("डी राज कंस्ट्रक्शन कंपनी", "डी राज बिल्डर्स")).toBe("different");
  });

  it("will not compare across scripts", () => {
    expect(compareNames("Otar Singh", "ओतारसिंह")).toBe("incomparable");
  });
});

describe("checkSellerNames", () => {
  const owners = ["श्री ओतारसिंह पुत्र श्री बालाराम", "श्री निहालसिंह पुत्र श्री बालाराम"];

  it("is quiet when every ID matches an owner", () => {
    expect(checkSellerNames({ sellerNames: ["ओतार सिंह", "निहालसिंह"], ownerNames: owners, deedText: "" })).toEqual([]);
  });

  it("raises an error for an ID that matches no owner", () => {
    const w = checkSellerNames({ sellerNames: ["सुनीता वर्मा"], ownerNames: owners, deedText: "" });
    expect(w).toHaveLength(1);
    const [only] = w;
    expect(only?.level).toBe("error");
    expect(only?.message).toContain("सुनीता वर्मा");
    expect(only?.message).toContain("ओतारसिंह");
  });

  it("raises a notice, not an error, for a partial match", () => {
    const w = checkSellerNames({ sellerNames: ["ओतार सिंह कुशवाह"], ownerNames: owners, deedText: "" });
    expect(w.map((x) => x.level)).toEqual(["notice"]);
  });

  it("without seller IDs, checks the deed already names each owner", () => {
    const deed = "विक्रेता - 1. श्री ओतारसिंह पुत्र श्री बालाराम\n2. श्री निहाल\u200dसिंह पुत्र श्री बालाराम";
    expect(checkSellerNames({ sellerNames: [], ownerNames: owners, deedText: deed })).toEqual([]);
  });

  it("without seller IDs, flags an owner the deed does not name", () => {
    const deed = "विक्रेता - श्री महेश शर्मा पुत्र श्री रामप्रसाद शर्मा";
    const w = checkSellerNames({ sellerNames: [], ownerNames: owners, deedText: deed });
    expect(w).toHaveLength(2);
    expect(w.every((x) => x.level === "error")).toBe(true);
  });

  it("says nothing when there is no land record to compare against", () => {
    expect(checkSellerNames({ sellerNames: ["सुनीता वर्मा"], ownerNames: [], deedText: "" })).toEqual([]);
  });
});
