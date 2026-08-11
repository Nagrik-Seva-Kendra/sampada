import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useLang } from "../../stores/uiStore";

/** The browser's own install event, which TypeScript's DOM lib doesn't declare. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "nsk-install-dismissed";

/**
 * Offers to install the workspace as a desktop app.
 *
 * A site cannot put itself on someone's machine or make itself open at
 * startup — the browser forbids it, and rightly so. What it can do is ask.
 * Once installed, Chrome's own "start app when you sign in" setting is what
 * makes it open with the computer, which is why the copy points at it.
 *
 * Rendered only when the browser says installing is actually possible:
 * `beforeinstallprompt` doesn't fire on an already-installed app, on browsers
 * that don't support it, or on a page that hasn't met the install criteria —
 * so there is no way to nag someone who has already done it.
 */
export function InstallAppPrompt() {
  const lang = useLang();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");

  useEffect(() => {
    function onAvailable(e: Event) {
      // Chrome shows its own mini-infobar unless the event is intercepted;
      // taking it lets the offer sit where the rest of the app's UI is.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    }
    function onInstalled() {
      setPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt || hidden) return null;
  const hi = lang === "hi";

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // Single-use: the browser will fire a fresh event if it's still installable.
    setPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setHidden(true);
  }

  return (
    <div className="install-prompt">
      <Download size={17} strokeWidth={2.2} className="install-prompt-icon" />
      <div className="install-prompt-body">
        <div className="install-prompt-title">
          {hi ? "इसे ऐप की तरह लगाएँ" : "Install this as an app"}
        </div>
        <div className="install-prompt-sub">
          {hi
            ? "टास्कबार से एक क्लिक में खुलेगा — और Chrome की सेटिंग से कंप्यूटर चालू होते ही अपने आप।"
            : "Opens from the taskbar in one click — and Chrome can start it automatically when you sign in."}
        </div>
      </div>
      <button type="button" className="btn-calc install-prompt-btn" onClick={() => void install()}>
        {hi ? "लगाएँ" : "Install"}
      </button>
      <button
        type="button"
        className="install-prompt-close"
        onClick={dismiss}
        aria-label={hi ? "बंद करें" : "Dismiss"}
      >
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
