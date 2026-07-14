import { useUiStore } from "../../stores/uiStore";

// Same number shown in the footer ("phone" string) and used for the
// WhatsApp deep link, formatted as a tel: link for one-tap dialing.
const PHONE_NUMBER = "+917898475648";

const LABEL: Record<"en" | "hi", string> = {
    en: "Call Now",
    hi: "अभी कॉल करें",
};

/**
 * Sticky floating "Call Now" launcher, stacked above the WhatsApp FAB so
 * visitors can reach the office by phone with one tap on any page/route.
 */
export function CallNowFab() {
    const lang = useUiStore((s) => s.lang);

  return (
        <a
                href={`tel:${PHONE_NUMBER}`}
                className="call-fab"
                aria-label={LABEL[lang]}
                title={LABEL[lang]}
              >
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                      <path
                                  fill="currentColor"
                                  d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z"
                                />
              </svg>
        </a>
      );
}
