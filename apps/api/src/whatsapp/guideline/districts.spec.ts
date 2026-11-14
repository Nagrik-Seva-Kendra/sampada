import { DEFAULT_OFFICE_FEES } from "@sampada/shared";
import { describe, expect, it } from "vitest";
import { guideFacts, guideNext, guideReply, mergeFacts, type GuideState } from "../guideline-chat.js";
import { stampDuty } from "./calculator.js";
import { choicesOf, interactivePayload } from "../wa-choices.js";
import { ALL_DISTRICTS, detectDistrict, districtRows } from "./districts.js";

const fees = DEFAULT_OFFICE_FEES;
const start = (text: string): GuideState => mergeFacts({ mode: "guide", step: "NAME", amount: null }, guideFacts(text));

describe("all 52 districts", () => {
  it("knows every district and has its rows", () => {
    expect(ALL_DISTRICTS).toHaveLength(52);
    for (const d of ALL_DISTRICTS) expect(districtRows(d.key).length, d.en).toBeGreaterThan(400);
  });

  it("reads rows with town, area type and the register's 16 rates", () => {
    const bhind = districtRows("bhind");
    const r1 = bhind.find((e) => e.sno === 1)!;
    expect(r1.hi).toBe("डिडी ग्रामीण मार्ग");
    expect(r1.town).toBe("भिंड");
    expect(r1.zone).toBe("nigam2");
    expect(r1.urban).toBe(true);
    expect([r1.pr, r1.pc, r1.pi, r1.agri_irr]).toEqual([8000, 12000, 8000, 6000000]);
    // municipal ward 9.5%, village 6.5% (as for Gwalior)
    expect(stampDuty(1_000_000, r1).sdPct).toBe(0.095);
    const village = bhind.find((e) => e.zone === "gramin")!;
    expect(village.urban).toBe(false);
    expect(stampDuty(1_000_000, village).sdPct).toBe(0.065);
  });
});

describe("naming the district", () => {
  it("finds the district and takes it out of the locality", () => {
    expect(detectDistrict("civil line sagar ka guideline")).toEqual({ key: "sagar", rest: "civil line ka guideline" });
    expect(detectDistrict("जिला भिंड में मकान")?.key).toBe("bhind");
    expect(detectDistrict("hoshangabad me plot")?.key).toBe("narmadapuram");
    expect(detectDistrict("maihar ward 5")?.key).toBe("satna");
  });

  it("a street named after a district is not the district", () => {
    expect(detectDistrict("datia road ward 12")).toBeNull();
    expect(detectDistrict("सागर ताल के पास")).toBeNull();
    expect(detectDistrict("agar ward pata nahi")).toBeNull();
  });
});

describe("the chat in another district", () => {
  it("looks in the named district", () => {
    const t = guideNext(start("Didi Grameen Marg bhind plot ka guideline"), fees);
    expect(t.state?.step).toBe("PICK");
    expect(t.replies[0]).toContain("भिंड ज़िले की");
    expect(t.replies[0]).toContain("डिडी ग्रामीण मार्ग");
  });

  it("not in Gwalior, found in one district only: goes there without asking", () => {
    const t = guideNext(start("Didi Grameen Marg ka guideline"), fees);
    expect(t.state?.step).toBe("PICK");
    expect(t.state?.district).toBe("bhind");
    expect(t.replies[0]).toContain("भिंड ज़िले की");
  });

  it("not in Gwalior, found in several districts: a list of them to tap", () => {
    const t = guideNext(start("netaji subhash ward ka guideline"), fees);
    expect(t.state?.step).toBe("DISTRICT");
    const opts = t.state!.districtOptions!;
    expect(opts.length).toBeGreaterThan(1);
    expect(opts.length).toBeLessThanOrEqual(9);
    // shown as WhatsApp list rows (district + how many places), 0 = another district
    const menu = choicesOf(t.replies[0]!)!;
    expect(menu.choices.map((c) => c.id)).toEqual([...opts.map((_, i) => String(i + 1)), "0"]);
    expect(menu.choices[0]!.label).toMatch(/\(\d+ जगह/);
    expect(interactivePayload(menu)).toMatchObject({ interactive: { type: "list" } });
    // tapping "2" (the list sends "2") looks in that district
    const t2 = guideReply(t.state!, "2", fees);
    expect(t2.state?.district).toBe(opts[1]);
    expect(t2.state?.step).toBe("PICK");
  });

  it("0 asks the district by name; a typed name works at the list too", () => {
    const t = guideNext(start("netaji subhash ward ka guideline"), fees);
    const t0 = guideReply(t.state!, "0", fees);
    expect(t0.replies[0]).toContain("ज़िले का नाम लिखें");
    const t1 = guideReply(t0.state!, "पन्ना", fees);
    expect(t1.state?.district).toBe("panna");
    expect(guideReply(t.state!, "narsinghpur", fees).state?.district).toBe("narsinghpur");
  });

  it("found nowhere in MP: said plainly", () => {
    const t = guideNext(start("Xyzabc Puram ka guideline"), fees);
    expect(t.state).toBeNull();
    expect(t.replies[0]).toContain("मध्य प्रदेश के किसी भी ज़िले");
  });

  it("a district written while choosing the row looks again there", () => {
    const t = guideNext(start("gandhi nagar ka guideline"), fees);
    expect(t.state?.step).toBe("PICK");
    expect(t.replies[0]).toContain("ग्वालियर ज़िले की");
    const t2 = guideReply(t.state!, "sagar", fees);
    expect(t2.state?.district).toBe("sagar");
    expect(t2.replies[0]).toContain("सागर ज़िले की");
  });
});
