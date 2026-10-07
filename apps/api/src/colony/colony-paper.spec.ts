import { describe, expect, it } from "vitest";
import { isoDate, mapPaper, matchPartner } from "./colony-paper.js";

const FULL = {
  project: "Flora City",
  plot: { block: "e", plotNo: "47" },
  buyers: [{ name: "श्री श्याम सुंदर", relation: "S/O", guardian: "श्री मोहन लाल", motherName: "सीता", address: "लश्कर", mobile: "+91 98765 43210", email: "s@x.in", aadhaar: "2345 6789 0123", pan: "abcde1234f" }],
  consideration: "15,00,000",
  instalments: [
    { date: "01/10/2026", amount: 500000, mode: "cheque", ref: "चेक 123456" },
    { date: "2026-10-05", amount: "10,00,000", mode: "rtgs", ref: "UTR 99" },
  ],
  partner: "महेश",
};

describe("company sale paper → sale", () => {
  it("a complete paper: nothing missing, numbers and names cleaned", () => {
    const s = mapPaper(FULL);
    expect(s.missing).toEqual([]);
    expect(s.plot).toEqual({ block: "E", plotNo: "47" });
    expect(s.consideration).toBe(1_500_000);
    expect(s.buyers[0]).toMatchObject({ name: "श्याम सुंदर", relation: "पुत्र", guardian: "मोहन लाल", mobile: "9876543210", aadhaar: "234567890123", pan: "ABCDE1234F" });
    expect(s.instalments).toEqual([
      { date: "2026-10-01", amount: 500_000, mode: "cheque", ref: "चेक 123456" },
      { date: "2026-10-05", amount: 1_000_000, mode: "rtgs", ref: "UTR 99" },
    ]);
  });

  it("says what is missing: Aadhaar, guardian, payment, totals", () => {
    const s = mapPaper({ ...FULL, buyers: [{ name: "राम", relation: null, guardian: null, aadhaar: "1234" }], instalments: [{ date: "01/10/2026", amount: 500000, mode: "cash" }] });
    expect(s.missing).toEqual(
      expect.arrayContaining(["क्रेता के पिता / पति का नाम", "क्रेता का आधार (12 अंक साफ़ नहीं)", "किश्तों का जोड़ ₹5,00,000 कुल राशि ₹15,00,000 के बराबर नहीं"]),
    );
    expect(mapPaper({ ...FULL, instalments: [] }).missing).toContain("भुगतान की किश्तें (तारीख, राशि, माध्यम)");
    expect(mapPaper({ ...FULL, instalments: [{ date: null, amount: 1500000, mode: "upi" }] }).missing).toContain("भुगतान की एक किश्त की तारीख");
    expect(mapPaper(null).missing).toEqual(expect.arrayContaining(["प्लाट नंबर", "क्रेता का नाम", "कुल राशि (प्रतिफल)"]));
  });

  it.each([
    ["2026-10-05", "2026-10-05"],
    ["05/10/2026", "2026-10-05"],
    ["5-10-26", "2026-10-05"],
    ["०५.१०.२०२६", "2026-10-05"],
    ["32/10/2026", null],
    ["kal", null],
  ])("date %s → %s", (a, b) => expect(isoDate(a)).toBe(b));

  it("partner: by name on the paper; the only one when there is one", () => {
    const ps = [
      { key: "mahesh", label: "महेश", text: "भागीदार श्री महेश गुप्ता" },
      { key: "rohit", label: "रोहित", text: "भागीदार श्री रोहित जैन" },
    ];
    expect(matchPartner(ps, "श्री महेश गुप्ता")?.key).toBe("mahesh");
    expect(matchPartner(ps, "rohit")?.key).toBe("rohit");
    expect(matchPartner(ps, null)).toBeNull();
    expect(matchPartner([ps[0]!], null)?.key).toBe("mahesh");
  });
});
