import { describe, expect, it } from "vitest";
import {
  GUIDELINE_DATA,
  agriAreaToSqm,
  agriValue,
  divertedValue,
  plotAreaToSqm,
  plotValue,
  stampDuty,
} from "./calculator.js";

/**
 * Golden values produced by running the office HTML calculator
 * (MP_Guideline_Calculator_2026-27.html, calc()) with the same inputs.
 * The port was additionally fuzz-compared against it on 640 random cases (0 mismatches).
 */
const GOLDEN = [
  {
    "name": "plot res 1500 sqft सालूपुरा (रोड से अन्दर)",
    "input": {
      "kind": "plot",
      "sno": 1063,
      "area": 1500,
      "unit": "sqft",
      "use": "res",
      "road": 0
    },
    "expectedTotal": 1741931,
    "expectedMaleTotal": 217741
  },
  {
    "name": "plot com 200 sqm A.B. road +corner",
    "input": {
      "kind": "plot",
      "sno": 2,
      "area": 200,
      "unit": "sqm",
      "use": "com",
      "road": 20,
      "corner": true
    },
    "expectedTotal": 15840000,
    "expectedMaleTotal": 1980000
  },
  {
    "name": "plot res gramin with consideration above guideline",
    "input": {
      "kind": "plot",
      "sno": 2232,
      "area": 300,
      "unit": "sqm",
      "use": "res",
      "road": 0,
      "consideration": 900000
    },
    "expectedTotal": 450000,
    "expectedMaleTotal": 52200
  },
  {
    "name": "agri nigam1 irrigated 0.5035 ha सालूपुरा",
    "input": {
      "kind": "agri",
      "sno": 1063,
      "area": 0.5035,
      "unit": "hect",
      "irrigated": true,
      "zone": "nigam1"
    },
    "expectedTotal": 18642800,
    "expectedMaleTotal": 2330350
  },
  {
    "name": "agri gramin unirrigated 1.2 ha",
    "input": {
      "kind": "agri",
      "sno": 2227,
      "area": 1.2,
      "unit": "hect",
      "irrigated": false,
      "zone": "gramin"
    },
    "expectedTotal": 864000,
    "expectedMaleTotal": 82080
  },
  {
    "name": "agri gramin small plot 0.025 ha",
    "input": {
      "kind": "agri",
      "sno": 2227,
      "area": 0.025,
      "unit": "hect",
      "irrigated": true,
      "zone": "gramin"
    },
    "expectedTotal": 300000,
    "expectedMaleTotal": 28500
  },
  {
    "name": "agri parishad 2 sellers 2000 sqm road 20",
    "input": {
      "kind": "agri",
      "sno": 2230,
      "area": 2000,
      "unit": "sqm",
      "irrigated": true,
      "zone": "parishad",
      "road": 20,
      "sellers": 2
    },
    "expectedTotal": 1046880,
    "expectedMaleTotal": 99453
  },
  {
    "name": "diverted res nigam1 2500 sqm",
    "input": {
      "kind": "diverted",
      "sno": 1063,
      "area": 2500,
      "unit": "sqm",
      "use": "res",
      "zone": "nigam1"
    },
    "expectedTotal": 14930000,
    "expectedMaleTotal": 1866250
  },
  {
    "name": "diverted com gramin 0.1 ha",
    "input": {
      "kind": "diverted",
      "sno": 2232,
      "area": 0.1,
      "unit": "hect",
      "use": "com",
      "zone": "gramin"
    },
    "expectedTotal": 2300000,
    "expectedMaleTotal": 218500
  }
] as const;

const bySno = (sno: number) => {
  const e = GUIDELINE_DATA.find((x) => x.sno === sno);
  if (!e) throw new Error("missing sno " + sno);
  return e;
};

describe("guideline calculator port — golden cases from the office calculator", () => {
  for (const c of GOLDEN as readonly any[]) {
    it(c.name, () => {
      const i = c.input;
      const entry = bySno(i.sno);
      let total: number;
      if (i.kind === "plot") {
        total = plotValue({ entry, areaSqm: plotAreaToSqm(i.area, i.unit), use: i.use, roadPct: i.road ?? 0, corner: !!i.corner, foundation: !!i.foundation }).value;
      } else if (i.kind === "agri") {
        total = agriValue({ entry, areaSqm: agriAreaToSqm(i.area, i.unit), irrigated: i.irrigated, zone: i.zone, roadPct: i.road ?? 0, sellers: i.sellers ?? 1, buyers: i.buyers ?? 1 }).total;
      } else {
        total = divertedValue({ entry, areaSqm: agriAreaToSqm(i.area, i.unit), use: i.use, zone: i.zone, roadPct: i.road ?? 0 }).total;
      }
      expect(Math.round(total)).toBe(c.expectedTotal);
      expect(stampDuty(total, entry, i.consideration ?? 0).male.total).toBe(c.expectedMaleTotal);
    });
  }

  it("has the full Gwalior 2026-27 table loaded", () => {
    expect(GUIDELINE_DATA.length).toBe(2160);
  });
});
