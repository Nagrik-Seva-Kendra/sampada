import { useUiStore } from "../stores/uiStore";

/** Compact EN/HI segmented switch, rendered once at the app root next to ThemeToggle. */
export function LangToggle() {
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);

  return (
    <div className="lang-toggle-fab" role="group" aria-label="Language">
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
        EN
      </button>
      <button type="button" className={lang === "hi" ? "on" : ""} onClick={() => setLang("hi")}>
        हि
      </button>
    </div>
  );
}
