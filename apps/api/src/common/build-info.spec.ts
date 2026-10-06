import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "../health/health.controller.js";
import { parseOwnerCommand } from "../tasks/task-rules.js";
import { OwnerAssistantService } from "../whatsapp/owner-assistant.service.js";
import { buildInfo, buildInfoText } from "./build-info.js";

afterEach(() => vi.unstubAllEnvs());

describe("which API copy is answering", () => {
  it("commit from Coolify's SOURCE_COMMIT, host name, start time; health shows them", () => {
    vi.stubEnv("SOURCE_COMMIT", "ec6879e3043488b5e47bb28fd82f25f545d19791");
    const b = buildInfo();
    expect(b.commit).toBe("ec6879e");
    expect(b.host.length).toBeGreaterThan(0);
    expect(new HealthController().check()).toMatchObject({ status: "ok", commit: "ec6879e", host: b.host, startedAt: b.startedAt });
    expect(buildInfoText()).toMatch(/^🔧 API version: commit ec6879e · container .+ · चालू: /);
    vi.stubEnv("SOURCE_COMMIT", "");
    expect(buildInfo().commit).toBe("unknown");
  });

  it("owner writes 'version' (also while a task waits for हाँ) → that line", async () => {
    expect(parseOwnerCommand("version", new Date())).toEqual({ kind: "version" });
    expect(parseOwnerCommand("वर्ज़न", new Date())).toEqual({ kind: "version" });
    vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
    const prisma: any = { waContact: { findUnique: async () => ({ state: { mode: "task-confirm", draft: {}, transcript: "x", source: "text", at: new Date().toISOString() } }), upsert: async () => undefined } };
    const owner = new OwnerAssistantService(prisma, {} as any, {} as any, { extract: vi.fn() } as any, {} as any);
    const r = await owner.handle("919111111111", { type: "text", text: "Version" });
    expect(r[0]).toContain("🔧 API version");
  });
});
