import { describe, expect, it } from "vitest";
import { confirmText, digestText, istDate, mapTaskExtract, parseDue, parseOwnerCommand, parseStaffDone } from "./task-rules.js";

// Thursday 1 Oct 2026, 11:00 IST
const NOW = istDate(2026, 9, 1, 11);
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("due dates in IST", () => {
  it("आज / कल / परसों with times; a day alone = 18:00", () => {
    expect(iso(parseDue("kal shaam", NOW))).toBe(iso(istDate(2026, 9, 2, 18)));
    expect(iso(parseDue("कल सुबह", NOW))).toBe(iso(istDate(2026, 9, 2, 10)));
    expect(iso(parseDue("परसों", NOW))).toBe(iso(istDate(2026, 9, 3, 18)));
    expect(iso(parseDue("aaj 5 baje", NOW))).toBe(iso(istDate(2026, 9, 1, 17)));
    expect(iso(parseDue("aaj 11:30 am", NOW))).toBe(iso(istDate(2026, 9, 1, 11, 30)));
  });
  it("weekdays mean the next one; dates and 'तारीख'", () => {
    expect(iso(parseDue("somvar tak", NOW))).toBe(iso(istDate(2026, 9, 5, 18))); // Mon 5 Oct
    expect(iso(parseDue("गुरुवार", NOW))).toBe(iso(istDate(2026, 9, 8, 18))); // next Thursday, not today
    expect(iso(parseDue("बुधवार", NOW))).toBe(iso(istDate(2026, 9, 7, 18)));
    expect(iso(parseDue("15 tarikh", NOW))).toBe(iso(istDate(2026, 9, 15, 18)));
    expect(iso(parseDue("1 तारीख", istDate(2026, 9, 20, 11)))).toBe(iso(istDate(2026, 10, 1, 18))); // next month
    expect(iso(parseDue("20/10", NOW))).toBe(iso(istDate(2026, 9, 20, 18)));
    expect(parseDue("jaldi", NOW)).toBeNull();
  });
});

describe("owner commands", () => {
  it("'3 हो गया' / '3 kal' / '3 रद्द' / list / staff broadcast / modes", () => {
    expect(parseOwnerCommand("3 हो गया", NOW)).toEqual({ kind: "done", n: 3 });
    expect(parseOwnerCommand("3 ho gaya", NOW)).toEqual({ kind: "done", n: 3 });
    expect(parseOwnerCommand("१२ done", NOW)).toEqual({ kind: "done", n: 12 });
    expect(parseOwnerCommand("3 kal", NOW)).toEqual({ kind: "due", n: 3, due: istDate(2026, 9, 2, 18) });
    expect(parseOwnerCommand("3 रद्द", NOW)).toEqual({ kind: "cancel", n: 3 });
    expect(parseOwnerCommand("काम", NOW)).toEqual({ kind: "list" });
    expect(parseOwnerCommand("सब स्टाफ को: कल 9 बजे आना है", NOW)).toEqual({ kind: "broadcast", message: "कल 9 बजे आना है" });
    expect(parseOwnerCommand("sab staff ko - files update karo", NOW)).toEqual({ kind: "broadcast", message: "files update karo" });
    expect(parseOwnerCommand("grahak mode", NOW)).toEqual({ kind: "customerMode" });
    expect(parseOwnerCommand("ओनर मोड", NOW)).toEqual({ kind: "ownerMode" });
    // a new task, not a command
    expect(parseOwnerCommand("Ramesh ji ka bainama somvar tak", NOW)).toBeNull();
    expect(parseOwnerCommand("3 log aayenge", NOW)).toBeNull();
  });
  it("staff 'हो गया'", () => {
    expect(parseStaffDone("हो गया")).toEqual({ n: null });
    expect(parseStaffDone("12 ho gaya")).toEqual({ n: 12 });
    expect(parseStaffDone("kal karunga")).toBeNull();
  });
});

describe("model extraction mapping", () => {
  it("keeps sure fields, parses the due phrase itself, normalises the mobile, empties the rest", () => {
    const d = mapTaskExtract(
      { title: "रमेश शर्मा का बैनामा", partyName: "रमेश शर्मा", partyPhone: "98765 43210", workType: "sale", place: "सिटी सेंटर", dueText: "सोमवार तक", note: null },
      NOW,
    );
    expect(d).toEqual({
      title: "रमेश शर्मा का बैनामा",
      partyName: "रमेश शर्मा",
      partyPhone: "919876543210",
      workType: "sale",
      place: "सिटी सेंटर",
      dueAt: istDate(2026, 9, 5, 18).toISOString(),
      note: null,
      assigneeName: null,
    });
    expect(mapTaskExtract({ partyName: "सीता", workType: "teleport", partyPhone: "12345" }, NOW)).toMatchObject({
      title: "सीता — अन्य",
      workType: "other",
      partyPhone: null,
      dueAt: null,
    });
    expect(mapTaskExtract("nonsense", NOW)).toBeNull();
  });
  it("confirmation and morning digest text", () => {
    const c = confirmText({ title: "x", partyName: "रमेश", partyPhone: "919876543210", workType: "mortgage", place: null, dueAt: istDate(2026, 9, 5, 18).toISOString(), note: null });
    expect(c).toContain("काम दर्ज: रमेश - बंधक - ");
    expect(c).toContain('ठीक? "हाँ" / "बदलें" / "रद्द"');
    const dg = digestText(
      [
        { number: 3, title: "रमेश बैनामा", dueAt: istDate(2026, 9, 1, 18) },
        { number: 1, title: "पुराना काम", dueAt: istDate(2026, 8, 28, 18) },
        { number: 5, title: "अगले हफ्ते", dueAt: istDate(2026, 9, 8, 18) },
      ],
      NOW,
    );
    expect(dg).toContain("⏰ पुराने बाकी (1):\n1. पुराना काम");
    expect(dg).toContain("आज (1):\n3. रमेश बैनामा");
    expect(dg).not.toContain("अगले हफ्ते");
    expect(digestText([], NOW)).toBe("");
  });
});
