import { describe, expect, it } from "vitest";
import { buildingValue, depr, flatValue, floorFactor, floorFactorCommercial, GUIDELINE_DATA, netRates } from "./calculator.js";

/**
 * Golden values produced by running the office's MP_Guideline_Calculator_2026-27.html
 * in Chromium (mode "bldg" / "flat", sumBox total). The port matched it on 300
 * random cases with 0 differences; these are 14 of them.
 */
const GOLDEN: any[] = [{"mode":"bldg","sno":1290,"plotSqm":323.83,"corner":false,"rescom":true,"floors":[{"age":5,"parts":{"shop":106.84,"godown":184.07}},{"age":26,"parts":{"rbc":39.67,"godown":12.81}},{"age":64,"parts":{"rcc":135.74}}],"expected":6173093},{"mode":"bldg","sno":138,"plotSqm":60.11,"corner":false,"rescom":false,"floors":[{"age":56,"parts":{"kac":14.78}},{"age":51,"parts":{"rcc":144.3}},{"age":23,"parts":{"kac":168.17,"tin":8.24}}],"expected":2777105},{"mode":"bldg","sno":1961,"plotSqm":229.49,"corner":true,"rescom":false,"floors":[{"age":20,"parts":{"tin":84.02}},{"age":27,"parts":{"tin":118.37}}],"expected":615085},{"mode":"bldg","sno":187,"plotSqm":92.65,"corner":true,"rescom":false,"floors":[{"age":5,"parts":{"rbc":91.38}},{"age":43,"parts":{"rcc":25.13,"kac":121.77}},{"age":47,"parts":{"rcc":97.09,"rbc":127.32}}],"expected":4435308},{"mode":"bldg","sno":1728,"plotSqm":69.67,"corner":false,"rescom":false,"floors":[{"age":41,"parts":{"rbc":59.48,"kac":57.55}},{"age":31,"parts":{"kac":138.42}}],"expected":581869},{"mode":"bldg","sno":623,"plotSqm":314.49,"corner":false,"rescom":true,"floors":[{"age":69,"parts":{"tin":22.67}},{"age":62,"parts":{"shop":119.58}},{"age":27,"parts":{"godown":52.34,"rbc":100.09}}],"expected":37720092},{"mode":"bldg","sno":842,"plotSqm":277.34,"corner":true,"rescom":false,"floors":[{"age":62,"parts":{"rbc":149.82}},{"age":9,"parts":{"rcc":50.17,"rbc":10.87}},{"age":12,"parts":{"kac":48.1,"tin":58.09}},{"age":47,"parts":{"tin":184.45,"kac":50.02}},{"age":21,"parts":{"kac":67.89}}],"expected":17779036},{"mode":"bldg","sno":1897,"plotSqm":243.15,"corner":false,"rescom":true,"floors":[{"age":68,"parts":{"kac":112.19,"godown":90.9}},{"age":11,"parts":{"shop":131.05}}],"expected":3208383},{"mode":"bldg","sno":937,"plotSqm":124.58,"corner":false,"rescom":false,"floors":[{"age":6,"parts":{"kac":65.97}},{"age":53,"parts":{"rcc":153.52}},{"age":12,"parts":{"rcc":82.35,"kac":89.81}},{"age":40,"parts":{"rcc":120.71}}],"expected":5859667},{"mode":"flat","sno":828,"com":true,"factor":0.7,"area":98.87,"expected":4650845},{"mode":"flat","sno":1334,"com":true,"factor":0.9,"area":238.08,"expected":0},{"mode":"flat","sno":2112,"com":false,"factor":0.8,"area":279.54,"expected":3466296},{"mode":"flat","sno":1265,"com":true,"factor":0.6,"area":147.72,"expected":0},{"mode":"flat","sno":133,"com":true,"factor":1,"area":152.87,"expected":4769544}];

const entry = (sno: number) => GUIDELINE_DATA.find((e) => e.sno === sno)!;

describe("building / duplex and flat: the office calculator", () => {
  it("depreciation, floor factors, net rates", () => {
    expect([0, 10, 11, 20, 21, 30, 41, 45, 46, 55, 60].map(depr)).toEqual([0, 0, 10, 10, 15, 20, 36, 36, 40, 45, 50]);
    expect([0, 1, 2, 3, 7].map(floorFactor)).toEqual([1, 0.95, 0.9, 0.85, 0.85]);
    expect([0, 1, 2, 3, 7].map(floorFactorCommercial)).toEqual([1, 0.8, 0.7, 0.6, 0.6]);
    const e = entry(845);
    expect(netRates(e).rcc).toBe(Math.max(0, e.brt - e.pr));
    expect(netRates(e).shop).toBe(Math.max(0, e.shop - e.pc));
  });

  it.each(GOLDEN.map((g, i) => [i, g]))("case %i matches the HTML calculator", (_i, g: any) => {
    const v =
      g.mode === "bldg"
        ? buildingValue({ entry: entry(g.sno), plotSqm: g.plotSqm, corner: g.corner, rescom: g.rescom, floors: g.floors }).total
        : flatValue({ entry: entry(g.sno), areaSqm: g.area, commercial: g.com, floorIdx: 0, lift: false, commercialFloorFactor: g.factor }).value;
    expect(Math.round(v)).toBe(g.expected);
  });
});
