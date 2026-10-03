import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveCopyService } from "./archive-copy.service.js";
import { Prisma } from "@prisma/client";

const ORG = "org-1";
const PHONE = "919876543210";

function fakePrisma() {
  const t: Record<string, any[]> = {};
  let seq = 0;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === "OR") return (v as any[]).some((w) => match(row, w));
      const x = row[k];
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v) return v.in.includes(x);
        if ("not" in v) return x !== v.not;
        if ("gte" in v) return x >= v.gte;
        if ("contains" in v) return String(x).includes(v.contains);
        return true;
      }
      return x === v;
    });
  const model = (name: string, defaults: () => any = () => ({})) => {
    const rows = (t[name] ??= []);
    return {
      findMany: async (a: any = {}) => rows.filter((r) => match(r, a.where)),
      findFirst: async (a: any = {}) => {
        const hit = rows.filter((r) => match(r, a.where));
        if (a.orderBy?.number === "desc") hit.sort((x, y) => y.number - x.number);
        return hit[0] ?? null;
      },
      findUnique: async (a: any) => rows.find((r) => match(r, a.where)) ?? null,
      count: async (a: any = {}) => rows.filter((r) => match(r, a.where)).length,
      create: async (a: any) => {
        const row = { id: `${name}-${++seq}`, createdAt: new Date(), ...defaults(), ...a.data };
        rows.push(row);
        return row;
      },
      update: async (a: any) => Object.assign(rows.find((r) => match(r, a.where)), a.data),
      upsert: async (a: any) => {
        const row = rows.find((r) => match(r, a.where));
        if (row) return Object.assign(row, a.update);
        rows.push({ ...a.create });
        return a.create;
      },
    };
  };
  const p: any = {
    t,
    archiveCopySetting: model("archiveCopySetting"),
    archiveCopyRequest: model("archiveCopyRequest", () => ({ status: "REQUESTED", reason: null, sentAt: null })),
    draftIntake: model("draftIntake"),
    waContact: model("waContact"),
    deedTemplate: model("deedTemplate"),
  };
  p.$unscoped = p;
  return p;
}

describe("registry copy on WhatsApp", () => {
  let prisma: any;
  let outbox: any;
  const svc = (role = "OWNER") => new ArchiveCopyService(prisma, { get: () => ({ userId: "u1", organizationId: ORG, membershipId: "m", role }) } as any, outbox);
  const codeFrom = (replies: string[]) => replies[0]!.match(/(\d{6})/)![1]!;

  beforeEach(async () => {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    prisma = fakePrisma();
    outbox = {
      alertOwners: vi.fn(async () => 1),
      deliverDirect: vi.fn(async () => ({ status: "SENT" })),
      deliverDocumentDirect: vi.fn(async () => ({ status: "SENT", reason: null })),
    };
    const base = { organizationId: ORG, status: "active" };
    await prisma.deedTemplate.create({ data: { ...base, id: "d-linked", title: "विक्रय पत्र — श्याम", content: "कुछ", createdAt: new Date("2025-03-12") } });
    await prisma.deedTemplate.create({ data: { ...base, id: "d-text", title: "बंधक पत्र", content: "मोबाइल नं. 98765 43210 आधार 2345 6789 0123", createdAt: new Date("2024-01-05") } });
    await prisma.deedTemplate.create({ data: { ...base, id: "d-longer", title: "दूसरा", content: "खाता 1987654321099", createdAt: new Date() } });
    await prisma.deedTemplate.create({ data: { ...base, id: "d-other-org", organizationId: "org-2", title: "x", content: "9876543210" } });
    await prisma.draftIntake.create({ data: { organizationId: ORG, phone: PHONE, status: "SUBMITTED", deedTemplateId: "d-linked" } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("OFF by default; only the owner switches it on", async () => {
    expect((await svc().handle(PHONE, "पुरानी रजिस्ट्री की कॉपी चाहिए"))![0]).toContain("अभी शुरू नहीं");
    await expect(svc("ADMIN").saveSettings(true, 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await svc().saveSettings(true, 3)).toMatchObject({ enabled: true, dailyLimit: 3 });
    expect(await svc().handle(PHONE, "नमस्ते")).toBeNull();
  });

  it("exact number match only (request link + the 10 digits standing alone in the deed)", async () => {
    const deeds = await svc().deedsFor(ORG, PHONE);
    expect(deeds.map((d) => d.id)).toEqual(["d-linked", "d-text"]);
    expect((await svc().deedsFor(ORG, "919111111111")).length).toBe(0);
  });

  it("code → list → pick → request for staff; wrong code 3 times stops", async () => {
    await svc().saveSettings(true, 3);
    const s = svc();
    const first = await s.handle(PHONE, "registry copy");
    expect(first![1]).toContain("6 अंकों का कोड");
    const code = codeFrom(first!);
    const state = prisma.t.waContact[0].state;
    expect(JSON.stringify(state)).not.toContain(code); // only a hash is stored
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await s.handle(PHONE, wrong))![0]).toContain("2 बार और");
    const list = await s.handle(PHONE, code);
    expect(list![0]).toContain("1. विक्रय पत्र — श्याम (12/03/2025)");
    expect(list![0]).toContain("2. बंधक पत्र");
    expect((await s.handle(PHONE, "5"))![0]).toContain("1 से 2");
    const done = await s.handle(PHONE, "2");
    expect(done![0]).toContain("अनुरोध #1 दर्ज");
    expect(prisma.t.archiveCopyRequest[0]).toMatchObject({ phone: PHONE, deedId: "d-text", status: "REQUESTED" });
    expect(outbox.alertOwners).toHaveBeenCalled();

    const again = await s.handle(PHONE, "registry copy");
    for (let i = 0; i < 3; i++) await s.handle(PHONE, codeFrom(again!) === "222222" ? "333333" : "222222");
    const st = prisma.t.waContact[0].state;
    expect(st === Prisma.DbNull).toBe(true); // cleared
  });

  it("at most N copies a day", async () => {
    await svc().saveSettings(true, 1);
    await prisma.archiveCopyRequest.create({ data: { organizationId: ORG, number: 1, phone: PHONE, deedId: "d-linked" } });
    expect((await svc().handle(PHONE, "पुरानी रजिस्ट्री"))![0]).toContain("आज की सीमा (1 कॉपी)");
  });

  it("staff: deed text masked + watermark; only a PDF is sent; window closed keeps it pending", async () => {
    await prisma.archiveCopyRequest.create({ data: { id: "r1", organizationId: ORG, number: 7, phone: PHONE, deedId: "d-text" } });
    await expect(svc("EMPLOYEE").list()).rejects.toBeInstanceOf(ForbiddenException);
    const d = await svc("ADMIN").deed("r1");
    expect(d.content).toContain("XXXX XXXX 0123");
    expect(d.content).not.toContain("2345 6789 0123");
    expect(d.watermark).toContain("प्रमाणित प्रति नहीं");
    expect(d.watermark).toContain("********3210");
    await expect(svc().send("r1", Buffer.from("hello world").toString("base64"))).rejects.toBeInstanceOf(BadRequestException);
    outbox.deliverDocumentDirect.mockResolvedValueOnce({ status: "PENDING", reason: "24 घंटे की विंडो बंद" });
    const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
    expect(await svc().send("r1", pdf)).toMatchObject({ status: "REQUESTED", reason: "24 घंटे की विंडो बंद" });
    expect(await svc().send("r1", pdf)).toMatchObject({ status: "SENT" });
    await expect(svc().send("r1", pdf)).rejects.toThrow(/निपट चुका/);
  });
});
