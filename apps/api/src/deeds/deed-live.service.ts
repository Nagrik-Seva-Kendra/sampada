import { Injectable } from "@nestjs/common";
import { BehaviorSubject } from "rxjs";

export interface DeedSelection {
  start: number;
  end: number;
}

/**
 * In-memory pub/sub for the "live highlight" feature: when a party
 * highlights text on the public share-link page, staff editing the same
 * deed sees it appear live. Deliberately not a database table or queue --
 * this is ephemeral, per-viewing-session state nobody needs once the
 * browser tab closes, and the API runs as a single container on our own
 * Coolify host, so an in-memory Map is visible to every connection without
 * needing Redis or similar.
 *
 * BehaviorSubject (not plain Subject): a staff member can open the editor
 * *after* the party already highlighted something, and should see that
 * current state immediately rather than waiting for the next change --
 * BehaviorSubject replays its latest value to every new subscriber.
 *
 * If this API is ever scaled to multiple instances, this class is the one
 * place that would need to move to a shared pub/sub (e.g. Redis) instead.
 */
@Injectable()
export class DeedLiveService {
  private readonly subjects = new Map<string, BehaviorSubject<DeedSelection | null>>();

  private subjectFor(deedId: string): BehaviorSubject<DeedSelection | null> {
    let subject = this.subjects.get(deedId);
    if (!subject) {
      subject = new BehaviorSubject<DeedSelection | null>(null);
      this.subjects.set(deedId, subject);
    }
    return subject;
  }

  /** Called whenever the party-facing page's text selection changes. */
  publish(deedId: string, selection: DeedSelection | null): void {
    this.subjectFor(deedId).next(selection);
  }

  /** Staff side subscribes here (via the SSE route) to receive live updates. */
  stream(deedId: string) {
    return this.subjectFor(deedId).asObservable();
  }
}
