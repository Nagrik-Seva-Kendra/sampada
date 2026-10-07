import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsappService } from "./whatsapp.service.js";

const OWNER = "919999900000";
const COMPANY = "919713257891";

beforeEach(async () => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
  vi.stubEnv("WA_ACCESS_TOKEN", "t");
  vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
  vi.stubEnv("WA_MEDIA_DIR", await mkdtemp(join(tmpdir(), "wa-paper-")));
  for (const k of ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function world() {
  const sent: { to: string; body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init?: any) => {
      const url = String(u);
      if (/\/img\d$/.test(url)) return new Response(JSON.stringify({ url: `https://media.example/${url.split("/").pop()}`, mime_type: "image/jpeg" }), { status: 200 });
      if (url.startsWith("https://media.example/")) return new Response(Buffer.from("jpg"), { status: 200 });
      const b = JSON.parse(init.body);
      if (b.type === "text") sent.push({ to: b.to, body: b.text.body });
      return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
    }),
  );
  let mode = false;
  const colony: any = {
    startOwnerCompanyMode: vi.fn(() => {
      mode = true;
      return ["🏢 कंपनी मोड 30 मिनट के लिए चालू।"];
    }),
    endOwnerCompanyMode: vi.fn(() => {
      mode = false;
      return true;
    }),
    inOwnerCompanyMode: () => mode,
    isCompanyNumber: async (p: string) => p === COMPANY || (p === OWNER && mode),
    handleCompanyFile: vi.fn(async (_p: string, files: unknown[]) => ({ replies: [`✅ डीड बन गई (${files.length} पन्ने)`], ownerAlert: "📄 alert" })),
    handleCompany: vi.fn(async () => ["status"]),
  };
  const owner: any = {
    isOwner: (p: string) => p === OWNER,
    inCustomerTest: async () => false,
    endCustomerTest: async () => ["✅ ओनर मोड चालू।"],
    handle: vi.fn(async () => ["TASK"]),
    handleFile: vi.fn(async () => ["TASK-FILE"]),
  };
  const outbox: any = { touchContact: async () => undefined, alertOwners: vi.fn(async () => 1), inWindow: async () => true };
  const wa = new WhatsappService(
    { waInboundMessage: { create: vi.fn(async () => ({})) } } as any,
    { hasActive: async () => false, handleText: async () => null } as any,
    outbox,
    { handleReply: async () => null, flushPending: async () => undefined } as any,
    { allowInbound: async () => true, withoutRepeats: async (_p: string, r: string[]) => r } as any,
    owner,
    { ownerText: async () => null, ownerButton: async () => null, handle: async () => null } as any,
    colony,
  );
  let n = 0;
  const msg = (from: string, m: any) =>
    wa.handlePayload({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { contacts: [{ profile: { name: "A" } }], messages: [{ id: `m${++n}`, from, ...m }] } }] }] });
  const text = (from: string, body: string) => msg(from, { type: "text", text: { body } });
  const image = (from: string, i: number) => msg(from, { type: "image", image: { id: `img${i}`, mime_type: "image/jpeg" } });
  return { sent, colony, owner, outbox, text, image, msg };
}

describe("colony sale papers on WhatsApp", () => {
  it("the owner's 'कंपनी मोड': the paper's two photos are read together and make the deed -- not a task", async () => {
    vi.useFakeTimers();
    vi.stubEnv("WA_PAPER_WAIT_MS", "15000");
    const w = world();
    await w.text(OWNER, "कंपनी मोड");
    expect(w.sent.at(-1)!.body).toContain("कंपनी मोड 30 मिनट");
    await w.image(OWNER, 1);
    await w.image(OWNER, 2);
    expect(w.sent.at(-1)!.body).toContain("कागज़ मिला");
    expect(w.colony.handleCompanyFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(w.colony.handleCompanyFile).toHaveBeenCalledTimes(1);
    expect(w.colony.handleCompanyFile.mock.calls[0][1]).toHaveLength(2);
    expect(w.sent.at(-1)!.body).toContain("डीड बन गई (2 पन्ने)");
    expect(w.outbox.alertOwners).toHaveBeenCalledWith("📄 alert");
    expect(w.owner.handleFile).not.toHaveBeenCalled();
    expect(w.owner.handle).not.toHaveBeenCalled();
    // "ओनर मोड": photos are tasks again.
    await w.text(OWNER, "ओनर मोड");
    expect(w.colony.endOwnerCompanyMode).toHaveBeenCalled();
    await w.image(OWNER, 3);
    expect(w.owner.handleFile).toHaveBeenCalledTimes(1);
  });

  it("a company number's photo goes the same way; without company mode the owner's photo is a task", async () => {
    vi.stubEnv("WA_PAPER_WAIT_MS", "0");
    const w = world();
    await w.image(COMPANY, 1);
    expect(w.colony.handleCompanyFile).toHaveBeenCalledTimes(1);
    expect(w.sent.at(-1)).toEqual({ to: COMPANY, body: "✅ डीड बन गई (1 पन्ने)" });
    await w.image(OWNER, 2);
    expect(w.owner.handleFile).toHaveBeenCalledTimes(1);
  });

  it("an 'unsupported' message (HD / view-once photo) is explained", async () => {
    const w = world();
    await w.msg(COMPANY, { type: "unsupported" });
    expect(w.sent.at(-1)!.body).toContain("HD नहीं");
  });
});
