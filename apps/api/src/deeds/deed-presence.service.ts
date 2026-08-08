import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { DeedCaret, DeedPeer } from "@sampada/shared";
import { BehaviorSubject, type Observable } from "rxjs";

interface TrackedPeer extends DeedPeer {
  lastSeenAt: number;
}

/**
 * A tab that stops heartbeating is gone: the laptop slept, the network
 * dropped, the browser killed the tab. Three missed beats (the client beats
 * every 8s) rides out a hiccup without leaving a ghost cursor sitting in the
 * document.
 */
const STALE_AFTER_MS = 25_000;
const SWEEP_EVERY_MS = 5_000;

/**
 * In-memory presence for the staff deed editor: who currently has a given
 * deed open, and where their cursor is. Same shape and reasoning as
 * DeedLiveService -- ephemeral per-tab state nobody needs once the browser
 * closes, and the API runs as a single container on our own Coolify host, so
 * a Map beats a table or Redis. These two services are the only places that
 * would have to move to a shared pub/sub if the API is ever run on more than
 * one instance.
 *
 * BehaviorSubject (not plain Subject) so someone opening the deed sees who is
 * already in it immediately, instead of waiting for the next person to move.
 */
@Injectable()
export class DeedPresenceService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Map<string, TrackedPeer>>();
  private readonly subjects = new Map<string, BehaviorSubject<DeedPeer[]>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_EVERY_MS);
    // Never hold the process open just to sweep an empty set of rooms.
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  /** Upsert one tab's cursor and mark it alive. Called on every heartbeat and every cursor move. */
  touch(deedId: string, peer: { sessionId: string; userId: string; name: string; caret: DeedCaret | null }): void {
    let room = this.rooms.get(deedId);
    if (!room) {
      room = new Map<string, TrackedPeer>();
      this.rooms.set(deedId, room);
    }
    room.set(peer.sessionId, { ...peer, lastSeenAt: Date.now() });
    this.emit(deedId);
  }

  /** Drop one tab immediately (it navigated away or closed) instead of waiting for it to go stale. */
  leave(deedId: string, sessionId: string): void {
    const room = this.rooms.get(deedId);
    if (!room?.delete(sessionId)) return;
    this.emit(deedId);
  }

  /** Every editor of this deed subscribes here, via the SSE route. */
  stream(deedId: string): Observable<DeedPeer[]> {
    return this.subjectFor(deedId).asObservable();
  }

  /**
   * Everyone currently in any deed, for the deeds list. Returns every room
   * this instance knows about -- the caller is responsible for narrowing it
   * to deeds the requester is allowed to see, since this service has no idea
   * which organization a deed belongs to.
   */
  occupiedDeeds(): Map<string, DeedPeer[]> {
    const snapshot = new Map<string, DeedPeer[]>();
    for (const deedId of this.rooms.keys()) {
      const peers = this.roster(deedId);
      if (peers.length > 0) snapshot.set(deedId, peers);
    }
    return snapshot;
  }

  private subjectFor(deedId: string): BehaviorSubject<DeedPeer[]> {
    let subject = this.subjects.get(deedId);
    if (!subject) {
      subject = new BehaviorSubject<DeedPeer[]>(this.roster(deedId));
      this.subjects.set(deedId, subject);
    }
    return subject;
  }

  private roster(deedId: string): DeedPeer[] {
    const room = this.rooms.get(deedId);
    if (!room) return [];
    return [...room.values()].map(({ lastSeenAt: _lastSeenAt, ...peer }) => peer);
  }

  private emit(deedId: string): void {
    this.subjectFor(deedId).next(this.roster(deedId));
  }

  /**
   * Expire tabs that stopped heartbeating, and forget rooms nobody is in or
   * listening to -- otherwise a long-lived server accumulates a subject per
   * deed ever opened. Only rooms that actually lost someone are re-emitted;
   * a watched room that has emptied out gets one final empty roster so the
   * last viewer's screen clears.
   */
  private sweep(): void {
    const cutoff = Date.now() - STALE_AFTER_MS;
    for (const [deedId, room] of this.rooms) {
      let expired = false;
      for (const [sessionId, peer] of room) {
        if (peer.lastSeenAt < cutoff) {
          room.delete(sessionId);
          expired = true;
        }
      }
      if (room.size === 0) this.rooms.delete(deedId);
      if (expired) this.emit(deedId);
    }

    for (const [deedId, subject] of this.subjects) {
      if (this.rooms.has(deedId) || subject.observed) continue;
      subject.complete();
      this.subjects.delete(deedId);
    }
  }
}
