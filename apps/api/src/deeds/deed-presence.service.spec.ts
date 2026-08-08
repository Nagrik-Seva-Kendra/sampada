import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { firstValueFrom } from "rxjs";
import type { DeedPeer } from "@sampada/shared";
import { DeedPresenceService } from "./deed-presence.service.js";

const DEED = "deed-1";
const OTHER_DEED = "deed-2";

function peer(sessionId: string, userId = "user-1", start = 0): Parameters<DeedPresenceService["touch"]>[1] {
  return { sessionId, userId, name: "Someone", caret: { start, end: start } };
}

/** The roster a subscriber joining right now would be handed. */
function roster(service: DeedPresenceService, deedId = DEED): Promise<DeedPeer[]> {
  return firstValueFrom(service.stream(deedId));
}

describe("DeedPresenceService", () => {
  let service: DeedPresenceService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new DeedPresenceService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it("starts a deed with nobody in it", async () => {
    expect(await roster(service)).toEqual([]);
  });

  it("replays the current roster to someone joining late", async () => {
    service.touch(DEED, peer("tab-a"));
    const seen = await roster(service);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.sessionId).toBe("tab-a");
  });

  it("pushes an update to everyone already watching", async () => {
    const seen: DeedPeer[][] = [];
    const sub = service.stream(DEED).subscribe((peers) => seen.push(peers));
    service.touch(DEED, peer("tab-a", "user-1", 10));
    service.touch(DEED, peer("tab-a", "user-1", 25));
    sub.unsubscribe();

    expect(seen).toHaveLength(3); // initial empty + two moves
    expect(seen[2]?.[0]?.caret).toEqual({ start: 25, end: 25 });
  });

  it("keeps one cursor per tab, so the same person in two tabs is two cursors", async () => {
    service.touch(DEED, peer("tab-a", "user-1"));
    service.touch(DEED, peer("tab-b", "user-1"));
    expect(await roster(service)).toHaveLength(2);
  });

  it("drops a tab as soon as it says it is leaving", async () => {
    service.touch(DEED, peer("tab-a"));
    service.leave(DEED, "tab-a");
    expect(await roster(service)).toEqual([]);
  });

  it("ignores a leave for a tab that was never here", async () => {
    service.touch(DEED, peer("tab-a"));
    service.leave(DEED, "tab-never");
    expect(await roster(service)).toHaveLength(1);
  });

  it("expires a tab that stops heartbeating", async () => {
    service.touch(DEED, peer("tab-a"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await roster(service)).toEqual([]);
  });

  it("keeps a tab that goes on heartbeating", async () => {
    service.touch(DEED, peer("tab-a"));
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(8_000);
      service.touch(DEED, peer("tab-a"));
    }
    expect(await roster(service)).toHaveLength(1);
  });

  it("expires only the silent tab, not its neighbour", async () => {
    service.touch(DEED, peer("tab-quiet"));
    await vi.advanceTimersByTimeAsync(20_000);
    service.touch(DEED, peer("tab-busy"));
    await vi.advanceTimersByTimeAsync(10_000);

    const seen = await roster(service);
    expect(seen.map((p) => p.sessionId)).toEqual(["tab-busy"]);
  });

  it("keeps deeds apart", async () => {
    service.touch(DEED, peer("tab-a"));
    service.touch(OTHER_DEED, peer("tab-b"));
    expect((await roster(service, DEED)).map((p) => p.sessionId)).toEqual(["tab-a"]);
    expect((await roster(service, OTHER_DEED)).map((p) => p.sessionId)).toEqual(["tab-b"]);
  });

  it("tells a watcher of an emptied deed that everyone has gone", async () => {
    const seen: DeedPeer[][] = [];
    const sub = service.stream(DEED).subscribe((peers) => seen.push(peers));
    service.touch(DEED, peer("tab-a"));
    await vi.advanceTimersByTimeAsync(30_000);
    sub.unsubscribe();

    expect(seen.at(-1)).toEqual([]);
  });

  it("reports which deeds have someone in them", () => {
    service.touch(DEED, peer("tab-a"));
    service.touch(OTHER_DEED, peer("tab-b", "user-2"));

    const occupied = service.occupiedDeeds();
    expect([...occupied.keys()].sort()).toEqual([DEED, OTHER_DEED]);
    expect(occupied.get(DEED)?.[0]?.sessionId).toBe("tab-a");
  });

  it("leaves an emptied deed out of the occupancy list entirely", async () => {
    service.touch(DEED, peer("tab-a"));
    service.leave(DEED, "tab-a");
    expect(service.occupiedDeeds().has(DEED)).toBe(false);

    service.touch(OTHER_DEED, peer("tab-b"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(service.occupiedDeeds().size).toBe(0);
  });

  it("does not leak the internal lastSeenAt bookkeeping to clients", async () => {
    service.touch(DEED, peer("tab-a"));
    const seen = await roster(service);
    expect(seen[0]).not.toHaveProperty("lastSeenAt");
  });
});
