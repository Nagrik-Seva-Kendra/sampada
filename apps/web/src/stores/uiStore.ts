import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "@sampada/shared";

type Theme = "light" | "dark";
export type View =
  | "home"
  | "guideline"
  | "eregistry"
  | "about"
  | "contact"
  | "partner"
  | "inbox";

/**
 * Client-only UI state (Zustand). theme+lang are persisted; setters stamp
 * `data-theme` / `data-lang` on <html> so CSS variables re-resolve. `view` is a
 * lightweight page switch until a real router lands. Server data lives in
 * TanStack Query — never duplicate API responses here.
 */
interface UiState {
  theme: Theme;
  lang: Language;
  view: View;
  toggleTheme: () => void;
  setLang: (lang: Language) => void;
  setView: (view: View) => void;
}

function applyToRoot(theme: Theme, lang: Language) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-lang", lang);
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      lang: "en",
      view: "home",
      toggleTheme: () => {
        const theme = get().theme === "dark" ? "light" : "dark";
        applyToRoot(theme, get().lang);
        set({ theme });
      },
      setLang: (lang) => {
        applyToRoot(get().theme, lang);
        set({ lang });
      },
      setView: (view) => set({ view }),
    }),
    {
      name: "nsk-ui",
      partialize: (s) => ({ theme: s.theme, lang: s.lang }),
      onRehydrateStorage: () => (state) => {
        if (state) applyToRoot(state.theme, state.lang);
      },
    },
  ),
);

/** Convenience hook: returns the current language. */
export function useLang() {
  return useUiStore((s) => s.lang);
}
