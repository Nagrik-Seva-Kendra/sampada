import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftIntakeService } from "./draft-intake.service.js";
import { alertMessage, alertNumbers, requestLink } from "./wa-alerts.js";

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("owner alert helpers", () => {
  it("WA_ALERT_NUMBERS: comma-separated, 10-digit numbers get 91, junk ignored", () => {
    expect(alertNumbers("9876543210, +91 98765 43211 ,919876543210,abc,12")).toEqual(["919876543210", "919876543211"]);
    expect(alertNumbers(undefined)).toEqual([]);
    expect(alertNumbers("")).toEqual([]);
  });

  it("link to the request in the office app", () => {
    expect(requestLink("abc")).toBe("https://app.nsk.mpe-registry.com/whatsapp-requests/abc");
    expect(requestLink("abc", "https://x.test/")).toBe("https://x.test/whatsapp-requests/abc");
  });

  it("message: request no., deed type, customer name, masked mobile, staff check, link", () => {
    const m = alertMessage({
      id: "cmg1abcdefxyz123",
      ref: "XYZ123",
      phone: "919876543210",
      customerName: "WA profile",
      data: { deedType: "mortgage", mortgagorName: "सीता देवी" },
      needsStaff: true,
    });
    expect(m.text).toBe(
      [
        "🔔 नया WhatsApp अनुरोध",
        "अनुरोध नंबर: XYZ123",
        "दस्तावेज़: बंधक पत्र",
        "ग्राहक: सीता देवी (********3210)",
        "⚠️ स्टाफ जाँच ज़रूरी",
        "देखें: https://app.nsk.mpe-registry.com/whatsapp-requests/cmg1abcdefxyz123",
      ].join("\n"),
    );
    expect(m.text).not.toContain("9876543210");
    expect(m.template).toEqual({
      name: "new_request_alert_v2",
      language: "hi",
      params: ["XYZ123", "बंधक पत्र", "सीता देवी", "हाँ"],
    });
    const plain = alertMessage({ id: "i", ref: "R", phone: "919876543210", customerName: "राम", data: {}, needsStaff: false });
    expect(plain.text).not.toContain("स्टाफ जाँच");
    expect(plain.text).toContain("दस्तावेज़: विक्रय पत्र");
    expect(plain.text).toContain("ग्राहक: राम (");
  });
});

describe("submit → owner alert", () => {
  const full = {
    buyerName: "श्याम", buyerRelation: "पुत्र", buyerFatherName: "मोहन", buyerMotherName: "सीता", buyerAadhaar: "enc:x",
    buyerMobile: "9876543210", buyerEmail: "s@example.com", buyerAddress: "लश्कर, ग्वालियर",
    regDate: null, regAlt: null, regTime: null, geoTagMode: "SELF",
  };
  function run(cur: any, env: string) {
    vi.stubEnv("WA_ALERT_NUMBERS", env);
    const outbox = { send: vi.fn(async () => ({})) };
    const prisma = { draftIntake: { findFirst: vi.fn(async () => cur), update: vi.fn(async ({ data }: any) => Object.assign(cur, data)) } };
    const svc = new DraftIntakeService(prisma as any, {} as any, {} as any, {} as any, outbox as any, { classify: async () => null } as any);
    return { outbox, say: (t: string) => svc.handleText({ phone: "919876543210", name: "राम" }, t) };
  }

  it("each alert number gets one ALERT with the request's details", async () => {
    const cur = { id: "cmg1abcdefxyz123", organizationId: "org-1", phone: "919876543210", customerName: "राम", step: "FINAL", status: "ACTIVE", data: { ...full }, needsStaff: true };
    const { outbox, say } = run(cur, "9111111111,9222222222");
    expect((await say("हाँ"))![0]).toContain("XYZ123");
    expect(outbox.send).toHaveBeenCalledTimes(2);
    const calls = outbox.send.mock.calls.map((c: any) => c[0]);
    expect(calls.map((c: any) => c.to)).toEqual(["919111111111", "919222222222"]);
    expect(calls[0]).toMatchObject({ kind: "ALERT", draftIntakeId: "cmg1abcdefxyz123", organizationId: "org-1" });
    expect(calls[0].text).toContain("⚠️ स्टाफ जाँच ज़रूरी");
  });

  it("'other' document requests alert too; no numbers configured → nothing sent; a failing alert never blocks the customer", async () => {
    const other = { id: "cmg1abcdefxyz123", organizationId: "org-1", phone: "919876543210", step: "OTHER_DESC", status: "ACTIVE", data: { idDone: {} }, needsStaff: false };
    const a = run(other, "9111111111");
    expect((await a.say("दान पत्र"))!.join()).toContain("अनुरोध दर्ज");
    expect((a.outbox.send.mock.calls[0] as any)[0].text).toContain("अन्य दस्तावेज़ (दान पत्र)");

    const none = run({ id: "x", step: "FINAL", status: "ACTIVE", data: { ...full }, needsStaff: false }, "");
    await none.say("हाँ");
    expect(none.outbox.send).not.toHaveBeenCalled();

    const failing = run({ id: "cmg1abcdefxyz123", phone: "91", step: "FINAL", status: "ACTIVE", data: { ...full }, needsStaff: false }, "9111111111");
    failing.outbox.send.mockRejectedValueOnce(new Error("down"));
    expect((await failing.say("हाँ"))![0]).toContain("अनुरोध दर्ज");
  });
});
