import { expect, test } from "@playwright/test";

/**
 * Colony Setup must belong to the selected project: open Setup on project A,
 * switch to project B (or create one) -- every field shows B's values, never
 * A's (saving there would write A's setup into B).
 */
const base = process.env.E2E_BASE_URL ?? "http://localhost:3999";
const login = process.env.E2E_LOGIN;
const password = process.env.E2E_PASSWORD;

test.skip(!login || !password, "E2E_LOGIN / E2E_PASSWORD not set");

test("Setup form and fill panel follow the project switcher", async ({ page, request }) => {
  const auth = await (await request.post(`${base}/api/v1/auth/login`, { data: { login, password } })).json();
  const h = { Authorization: `Bearer ${auth.accessToken}` };
  const stamp = Date.now().toString(36).toUpperCase();
  const blank = { kind: "PLOT", village: "", ward: "", surveyNos: "", aliases: "", guidelineSno: null, developer: "", partners: [], devPermissions: ["", ""], maintenanceClauses: ["", ""], guidelineRatePerSqm: null, template: "", templateDeedId: null, companyNumbers: [] };
  const a = await (await request.post(`${base}/api/v1/colony/projects`, { headers: h, data: { ...blank, name: `A ${stamp}`, village: "डोंगरपुर", ward: "60", developer: "मैसर्स ए डेवलपर्स" } })).json();
  const b = await (await request.post(`${base}/api/v1/colony/projects`, { headers: h, data: { ...blank, name: `B ${stamp}`, kind: "SHOP", village: "सिरौल", ward: "61", developer: "बी रियल्टर्स प्रा.लि." } })).json();

  await page.addInitScript((s) => localStorage.setItem("nsk-auth", s), JSON.stringify({ state: { token: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user }, version: 0 }));
  await page.goto(`${base}/colony`);
  const switcher = page.locator("select.dr-action-select").first();
  await switcher.selectOption(a.id);
  await page.getByRole("button", { name: /Setup|सेटअप/ }).click();
  const field = (label: RegExp) => page.locator("label.modal-field", { hasText: label }).locator("input").first();
  await expect(field(/^(Developer|डेवलपर)/)).toHaveValue("मैसर्स ए डेवलपर्स");
  await expect(field(/^(Ward|वार्ड)/)).toHaveValue("60");

  // Switch to B while Setup is open: every field is B's.
  await switcher.selectOption(b.id);
  await expect(field(/^(Developer|डेवलपर)/)).toHaveValue("बी रियल्टर्स प्रा.लि.");
  await expect(field(/^(Ward|वार्ड)/)).toHaveValue("61");
  await expect(field(/^(Village|ग्राम)/)).toHaveValue("सिरौल");
  await expect(page.locator("label.modal-field", { hasText: /^(Project type|प्रोजेक्ट का प्रकार)/ }).locator("select")).toHaveValue("SHOP");
  await expect(page.getByText(/old deed\(s\) read|पुरानी डीड पढ़ी गईं/)).toHaveCount(0);

  // And back.
  await switcher.selectOption(a.id);
  await expect(field(/^(Developer|डेवलपर)/)).toHaveValue("मैसर्स ए डेवलपर्स");
});
