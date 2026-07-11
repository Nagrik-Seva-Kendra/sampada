import { useCallback, useEffect, useRef, useState } from "react";

/** What the status line beside the editor shows. `idle` renders nothing. */
export type AutoSaveStatus = "idle" | "saving" | "saved" | "retrying";

/** Wait this long after the last keystroke before saving. */
const DEBOUNCE_MS = 2000;
/** Wait this long after a failed save before trying again. */
const RETRY_MS = 3000;
/** Hold "Saving…" at least this long so a fast save is still perceptible before "Saved ✓". */
const MIN_SAVING_MS = 700;
/** Keep "Saved ✓" up this long, then clear it so the next edit shows "Saving…" fresh. */
const SAVED_VISIBLE_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DeedDraft {
  title: string;
  content: string;
}

function isSame(a: DeedDraft, b: DeedDraft): boolean {
  return a.title === b.title && a.content === b.content;
}

/**
 * Debounced auto-save for the deed editor.
 *
 * Saves `draft` roughly `DEBOUNCE_MS` after the author stops typing, and only
 * when it actually differs from what was last saved. `baseline` must be called
 * with the deed as loaded from the server, so the first render doesn't count as
 * an edit and save a deed nobody touched.
 *
 * Two things it guarantees, both of which matter with a 2s debounce and a slow
 * connection:
 *
 * - Only one save is ever in flight. Typing during a save doesn't start a
 *   second, racing request (whose response could land out of order and leave
 *   the record holding older text); it queues, and re-runs once the first
 *   settles.
 * - A failed save keeps retrying on a timer until it lands, so a dropped
 *   connection doesn't silently cost the author their work.
 */
export function useAutoSaveDeed({
  draft,
  save,
  enabled,
}: {
  draft: DeedDraft;
  /** Persists the draft. Must reject on failure — that's what drives the retry. */
  save: (draft: DeedDraft) => Promise<unknown>;
  /** False while the deed is still loading; nothing is saved until it flips true. */
  enabled: boolean;
}) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveRef = useRef(save);
  saveRef.current = save;

  /** The last draft known to be on the server; null until baseline() runs. */
  const savedRef = useRef<DeedDraft | null>(null);
  const inFlightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const setStatusIfMounted = useCallback((next: AutoSaveStatus) => {
    // Any status change cancels a pending "Saved ✓" auto-hide — e.g. a new save
    // starting replaces the tick with "Saving…" rather than blanking under it.
    if (savedClearRef.current) {
      clearTimeout(savedClearRef.current);
      savedClearRef.current = null;
    }
    if (mountedRef.current) setStatus(next);
  }, []);

  /** Adopt `next` as the server's copy — call it with the freshly loaded deed. */
  const baseline = useCallback((next: DeedDraft) => {
    savedRef.current = { ...next };
  }, []);

  const isDirty = useCallback(
    () => savedRef.current !== null && !isSame(draftRef.current, savedRef.current),
    [],
  );

  const run = useCallback(async () => {
    // A save already running is left to finish: it re-checks for new edits when
    // it lands, so there's no need to queue anything here.
    if (inFlightRef.current || !isDirty()) return;

    const snapshot = { ...draftRef.current };
    const startedAt = Date.now();
    inFlightRef.current = true;
    setStatusIfMounted("saving");
    try {
      await saveRef.current(snapshot);
      savedRef.current = snapshot;
      // A local save can finish in tens of ms — hold "Saving…" a beat so it's
      // actually seen, not just a flicker before "Saved ✓". inFlightRef stays
      // set through the wait, so no second save starts underneath it.
      const remaining = MIN_SAVING_MS - (Date.now() - startedAt);
      if (remaining > 0) await sleep(remaining);
      inFlightRef.current = false;
      // Anything typed while the request was in flight is now unsaved — the
      // draft no longer matches the snapshot that just landed, so go again.
      if (isDirty()) {
        void run();
      } else {
        // Flash "Saved ✓", then clear it so it doesn't linger as a stale badge;
        // the next edit brings "Saving…" back fresh.
        setStatusIfMounted("saved");
        savedClearRef.current = setTimeout(() => setStatusIfMounted("idle"), SAVED_VISIBLE_MS);
      }
    } catch {
      inFlightRef.current = false;
      setStatusIfMounted("retrying");
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => void run(), RETRY_MS);
    }
  }, [isDirty, setStatusIfMounted]);

  // Every edit restarts the debounce window, so we save once the author pauses
  // rather than once per keystroke.
  useEffect(() => {
    if (!enabled || !isDirty()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, enabled, isDirty, run]);

  /** Save right now, skipping the debounce — the explicit Save button. */
  const saveNow = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    await run();
  }, [run]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      if (savedClearRef.current) clearTimeout(savedClearRef.current);
      // Leaving with edits still inside the debounce window: fire the save on
      // the way out. The request outlives the component, so the last few
      // keystrokes aren't lost — but a closing tab can still cut it short,
      // which is what the beforeunload warning below is for. Nothing is left to
      // show an error to, so swallow a failure rather than leave it unhandled.
      if (isDirty() && !inFlightRef.current) {
        void saveRef.current({ ...draftRef.current }).catch(() => {});
      }
    };
  }, [isDirty]);

  // Warn before the tab closes on unsaved edits (browsers show their own copy).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!enabled || (!isDirty() && !inFlightRef.current)) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled, isDirty]);

  return { status, baseline, saveNow };
}
