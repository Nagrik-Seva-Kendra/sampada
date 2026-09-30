import { describe, expect, it } from "vitest";
import { ID_PHOTO_LABEL, namesMatch, nameSkeleton, SAMPADA_REQUIRED_PARTY_PHOTOS } from "./id-photos.js";

describe("ID photo config", () => {
  it("asks every party for Aadhaar front/back, PAN and a passport photo", () => {
    expect([...SAMPADA_REQUIRED_PARTY_PHOTOS]).toEqual(["aadhaarFront", "aadhaarBack", "pan", "passportPhoto"]);
    for (const k of SAMPADA_REQUIRED_PARTY_PHOTOS) expect(ID_PHOTO_LABEL[k]).toBeTruthy();
  });
});

describe("namesMatch (Aadhaar vs PAN, PAN father vs typed)", () => {
  it("matches Hindi and English spellings of the same name", () => {
    expect(nameSkeleton("राजेश कुमार शर्मा")).toEqual(nameSkeleton("RAJESH KUMAR SHARMA"));
    expect(namesMatch("राजेश कुमार शर्मा", "RAJESH KUMAR SHARMA")).toBe(true);
    expect(namesMatch("श्रीमती लक्ष्मी देवी", "LAXMI DEVI")).toBe(true);
    expect(namesMatch("Priya", "प्रिया")).toBe(true);
    expect(namesMatch("श्याम सुंदर", "Shyam Sunder")).toBe(true);
  });

  it("allows a missing middle name, an initial and a one-letter spelling slip", () => {
    expect(namesMatch("Amit Sharma", "AMIT KUMAR SHARMA")).toBe(true);
    expect(namesMatch("R. K. Sharma", "RAJESH KUMAR SHARMA")).toBe(true);
    expect(namesMatch("Sunita Devi", "SUNEETA DEVI")).toBe(true);
  });

  it("flags different people", () => {
    expect(namesMatch("राजेश कुमार शर्मा", "MAHESH KUMAR VERMA")).toBe(false);
    expect(namesMatch("Amit Sharma", "SUMIT SHARMA")).toBe(false);
    expect(namesMatch("Ram Prasad", "")).toBeNull();
  });
});
