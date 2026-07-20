import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { api } from "../../lib/api";

/** Same base the REST client uses (see lib/api.ts) -- EventSource needs a full URL, not a relative path. */
const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

export interface DeedSelection {
  start: number;
  end: number;
}

/** Plain-text character offsets of the current selection within `container`, or null if there isn't one. */
function readSelectionOffsets(container: HTMLElement): DeedSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const preStart = document.createRange();
  preStart.selectNodeContents(container);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;

  const preEnd = document.createRange();
  preEnd.selectNodeContents(container);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const end = preEnd.toString().length;

  return end > start ? { start, end } : null;
}

/**
 * Public share-link page: publishes the party's current text selection so
 * staff editing the same deed see it live. Debounced fire-and-forget POSTs
 * to the (unauthenticated) selection endpoint -- failures are silently
 * ignored, since a missed highlight update is never worth surfacing an
 * error to the party.
 */
export function usePublishSelection(deedId: string | undefined, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!deedId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSentKey = "";

    function send(selection: DeedSelection | null) {
      const key = selection ? `${selection.start}:${selection.end}` : "null";
      if (key === lastSentKey) return;
      lastSentKey = key;
      void api
        .post(`public/deeds/${deedId}/selection`, {
          json: selection ?? { start: null, end: null },
        })
        .catch(() => {});
    }

    function onSelectionChange() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const container = containerRef.current;
        send(container ? readSelectionOffsets(container) : null);
      }, 200);
    }

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (timer) clearTimeout(timer);
      send(null); // Clear the highlight for staff once the party navigates away.
    };
  }, [deedId, containerRef]);
}

/**
 * Staff editor: live-subscribes to the party's current highlight on this
 * deed via Server-Sent Events -- `EventSource` is built into the browser,
 * so this needs no client library (and no new dependency to add).
 */
export function useLiveSelection(deedId: string | undefined): DeedSelection | null {
  const [selection, setSelection] = useState<DeedSelection | null>(null);

  useEffect(() => {
    if (!deedId) return;
    setSelection(null);
    const source = new EventSource(`${API_BASE}/public/deeds/${deedId}/selection-stream`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DeedSelection | null;
        setSelection(data && typeof data.start === "number" && typeof data.end === "number" ? data : null);
      } catch {
        setSelection(null);
      }
    };
    return () => source.close();
  }, [deedId]);

  return selection;
}
