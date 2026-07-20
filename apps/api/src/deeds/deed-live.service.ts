import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export interface DeedSelection {
  start: number;
  end: number;
}

/**
 * In-memory pub/sub for the "live highlight" feature: when a party
 * highlights text on the public share-link page, staff editing the same
 * deed sees it appear live. Deliberately not a database table or queue --
 * this is ephemeral, per-viewing-session state nobody needs once the
 * browser tab closes, and Render's free-tier web service runs a single
 * instance, so an in-memory Map is visible to every connection without
 * needing Redis or similar.
 *
 * If this API is ever scaled to multiple instances, this class is the one
 * place that would need to move to a shared pub/sub (e.g. Redis) instead.
 */
@Injectable()
export class DeedLiveService {
  private readonly subjects = new Map<string, Subject<DeedSelection | null>>();

  private subjectFor(deedId: string): Subject<DeedSelection | null> {
    let subject = this.subjects.get(deedId);
    if (!subject) {
      subject = new Subject<DeedSelection | null>();
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
