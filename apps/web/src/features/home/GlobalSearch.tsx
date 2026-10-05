import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { SearchHit, SearchKind } from "@sampada/shared";
import type { StringKey } from "../../i18n/strings";
import { useWaT } from "../whatsapp/waI18n";
import { useGlobalSearch } from "./useHome";
import "./home.css";

const ORDER: SearchKind[] = ["request", "deed", "task", "callback", "plot"];

/** Debounced value. */
function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

/** True when the key press is the "/" shortcut (not typed into a field). */
export function isSearchShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">, target: EventTarget | null): boolean {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return !(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable);
}

/** Global search box in the app shell: "/" focuses it; arrows / Enter / Esc work in the list. */
export function GlobalSearch() {
  const { t } = useWaT();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = useDebounced(q, 250);
  const res = useGlobalSearch(term);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchShortcut(e, e.target)) return;
      e.preventDefault();
      input.current?.focus();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useMemo(() => {
    const list = res.data ?? [];
    return ORDER.flatMap((k) => list.filter((h) => h.kind === k));
  }, [res.data]);
  useEffect(() => setActive(0), [hits]);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    void navigate({ to: h.to });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    } else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]!);
    }
  };

  const show = open && q.trim().length > 0;
  let body: React.ReactNode = null;
  if (q.trim().length < 2) body = <p className="search-note">{t("srMin")}</p>;
  else if (res.isError) body = <p className="search-note">{t("srError")}</p>;
  else if (res.isFetching && !res.data) body = <p className="search-note">…</p>;
  else if (!hits.length) body = <p className="search-note">{t("srNone")}</p>;
  else {
    let i = 0;
    body = ORDER.map((k) => {
      const group = hits.filter((h) => h.kind === k);
      if (!group.length) return null;
      return (
        <div key={k} className="search-group" role="group" aria-label={t(`srKind_${k}` as StringKey)}>
          <div className="search-group-title">{t(`srKind_${k}` as StringKey)}</div>
          {group.map((h) => {
            const idx = i++;
            return (
              <button
                key={h.kind + h.id}
                type="button"
                role="option"
                aria-selected={idx === active}
                className={"search-hit" + (idx === active ? " on" : "")}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
              >
                <span className="search-hit-title">{h.title}</span>
                {h.subtitle && <span className="search-hit-sub">{h.subtitle}</span>}
              </button>
            );
          })}
        </div>
      );
    });
  }

  return (
    <div className="global-search">
      <Search size={16} className="global-search-icon" aria-hidden="true" />
      <input
        ref={input}
        type="search"
        value={q}
        placeholder={t("srPlaceholder")}
        aria-label={t("srLabel")}
        aria-expanded={show}
        role="combobox"
        aria-autocomplete="list"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <div className="search-pop" role="listbox">
          {body}
        </div>
      )}
    </div>
  );
}
