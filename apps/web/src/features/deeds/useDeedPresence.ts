import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { DeedCaret, DeedPeer } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Same base the REST client uses (see lib/api.ts) -- the stream needs a full URL, not a relative path. */
const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

/** Fast enough that a moving cursor looks live, slow enough that holding a key down doesn't flood the API. */
const MOVE_THROTTLE_MS = 120;
/** Well inside the server's 25s staleness window, so two dropped beats still don't drop the cursor. */
const HEARTBEAT_MS = 8_000;
const RECONNECT_MS = 3_000;

/** Per browser tab. Not from the user id: the same person with the deed open twice is genuinely in two places. */
function newSessionId(): string {
  return crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function caretKey(caret: DeedCaret | null): string {
  return caret ? `${caret.start}:${caret.end}` : "none";
}

/**
 * Live cursors for the staff deed editor: publishes this tab's caret and
 * returns everyone else's, so two people with the same deed open can see
 * where the other is working.
 *
 * Deliberately not an `EventSource` like the party-highlight stream: this
 * route is authenticated, and EventSource can't send an Authorization header
 * -- putting the access token in the query string instead would leak it into
 * proxy and access logs. A streamed `fetch` can carry the header, at the cost
 * of reconnecting by hand (EventSource does that part for free).
 */
export function useDeedPresence(
  deedId: string | undefined,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
): DeedPeer[] {
  const [peers, setPeers] = useState<DeedPeer[]>([]);
  const sessionIdRef = useRef<string>("");
  if (!sessionIdRef.current) sessionIdRef.current = newSessionId();

  // Receive: everyone's cursors on this deed, including our own echo (filtered
  // out below, so this tab never renders a second cursor over its real one).
  useEffect(() => {
    if (!deedId) return;
    setPeers([]);
    const abort = new AbortController();
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        const res = await fetch(`${API_BASE}/deeds/${deedId}/presence-stream`, {
          headers: { ...authHeaders(useAuthStore.getState().token), Accept: "text/event-stream" },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`presence stream: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Server-sent events arrive as frames separated by a blank line; a
          // read can end mid-frame, so only whole frames are consumed here and
          // the remainder waits for the next chunk.
          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("");
            if (data) {
              try {
                setPeers(JSON.parse(data) as DeedPeer[]);
              } catch {
                // A frame we can't read tells us nothing about the others.
              }
            }
            split = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Dropped connection, expired token, sleeping laptop -- all the same
        // from here: wait, then try again. A stale roster on screen is worse
        // than an empty one, so clear it while disconnected.
      }
      if (stopped) return;
      setPeers([]);
      retry = setTimeout(() => void connect(), RECONNECT_MS);
    }

    void connect();
    return () => {
      stopped = true;
      abort.abort();
      if (retry) clearTimeout(retry);
    };
  }, [deedId]);

  // Publish: this tab's caret, throttled, plus a heartbeat so the server can
  // tell "sitting still" from "gone".
  useEffect(() => {
    if (!deedId) return;
    const sessionId = sessionIdRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSentKey = "";
    let lastCaret: DeedCaret | null = null;

    function post(caret: DeedCaret | null, leaving = false) {
      void api
        .post(`deeds/${deedId}/presence`, {
          headers: authHeaders(useAuthStore.getState().token),
          json: { sessionId, caret, leaving },
          // The leaving beat is sent while the tab is being torn down; without
          // this the browser cancels it and the cursor lingers until it goes
          // stale.
          keepalive: leaving,
        })
        .catch(() => {
          // Nobody needs to be told their cursor didn't reach the others; the
          // next move (or heartbeat) retries on its own.
          lastSentKey = "";
        });
    }

    /** Where the caret is, or null when this tab isn't the one being typed in. */
    function readCaret(): DeedCaret | null {
      const el = textareaRef.current;
      if (!el || document.activeElement !== el) return null;
      return { start: el.selectionStart, end: el.selectionEnd };
    }

    function send(caret: DeedCaret | null, force = false) {
      const key = caretKey(caret);
      if (!force && key === lastSentKey) return;
      lastSentKey = key;
      lastCaret = caret;
      post(caret);
    }

    function onCaretMayHaveMoved() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => send(readCaret()), MOVE_THROTTLE_MS);
    }

    const el = textareaRef.current;
    document.addEventListener("selectionchange", onCaretMayHaveMoved);
    el?.addEventListener("focus", onCaretMayHaveMoved);
    el?.addEventListener("blur", onCaretMayHaveMoved);
    el?.addEventListener("input", onCaretMayHaveMoved);

    // Announce ourselves right away, so the other side sees "someone is here"
    // before this tab's cursor has moved at all.
    send(readCaret(), true);
    const beat = setInterval(() => send(lastCaret, true), HEARTBEAT_MS);

    // pagehide (not unload) is the one the bfcache and mobile browsers
    // actually fire; React's cleanup covers ordinary in-app navigation.
    const onPageHide = () => post(null, true);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("selectionchange", onCaretMayHaveMoved);
      el?.removeEventListener("focus", onCaretMayHaveMoved);
      el?.removeEventListener("blur", onCaretMayHaveMoved);
      el?.removeEventListener("input", onCaretMayHaveMoved);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(beat);
      if (timer) clearTimeout(timer);
      post(null, true);
    };
  }, [deedId, textareaRef]);

  return peers.filter((p) => p.sessionId !== sessionIdRef.current);
}
