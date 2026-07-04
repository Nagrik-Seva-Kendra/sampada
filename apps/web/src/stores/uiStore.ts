import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "@sampada/shared";

type Theme = "light" | "dark";

/**
 * Client-only UI state (Zustand). theme+lang are persisted; setters stamp
 * `data-theme` / `data-lang` on <html> so CSS variables re-resolve. Page
 * navigation lives in TanStack Router; server data in TanStack Query — never
 * duplicate either here.
 */
interface UiState {
  theme: Theme;
  lang: Language;
  toggleTheme: () => void;
  setLang: (lang: Language) => void;
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
      toggleTheme: () => {
        const theme = get().theme === "dark" ? "light" : "dark";
        applyToRoot(theme, get().lang);
        set({ theme });
      },
      setLang: (lang) => {
        applyToRoot(get().theme, lang);
        set({ lang });
      },
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
