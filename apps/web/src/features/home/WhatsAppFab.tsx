import { useUiStore } from "../../stores/uiStore";

// Same number shown in the footer ("phone" string), digitized with the
// India country code for the wa.me deep link.
const WHATSAPP_NUMBER = "917898475648";

const PREFILL: Record<"en" | "hi", string> = {
  en: "Hi! I'd like help with property registration / deeds.",
  hi: "नमस्ते! मुझे संपत्ति रजिस्ट्रेशन / विलेख के बारे में मदद चाहिए।",
};

const LABEL: Record<"en" | "hi", string> = {
  en: "Chat with us on WhatsApp",
  hi: "व्हाट्सएप पर हमसे चैट करें",
};

/**
 * Sticky bottom-right WhatsApp launcher, rendered once at the app root so it
 * follows the visitor across every page/route.
 */
export function WhatsAppFab() {
  const lang = useUiStore((s) => s.lang);
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(PREFILL[lang])}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="wa-fab"
      aria-label={LABEL[lang]}
      title={LABEL[lang]}
    >
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.004 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.257.593 4.373 1.63 6.207L3.2 28.8l6.76-1.77a12.74 12.74 0 0 0 6.044 1.54h.005c7.07 0 12.8-5.73 12.8-12.8s-5.73-12.57-12.805-12.57Zm0 23.36a10.53 10.53 0 0 1-5.37-1.47l-.385-.228-4.012 1.05 1.07-3.912-.25-.402a10.55 10.55 0 0 1-1.617-5.598c0-5.84 4.753-10.593 10.597-10.593 2.83 0 5.49 1.104 7.49 3.107a10.52 10.52 0 0 1 3.103 7.49c0 5.84-4.753 10.556-10.626 10.556Zm5.8-7.908c-.317-.16-1.877-.927-2.168-1.033-.29-.107-.5-.16-.712.16-.21.318-.818 1.033-1.003 1.244-.184.213-.37.24-.686.08-.317-.16-1.34-.494-2.552-1.575-.943-.84-1.58-1.878-1.764-2.196-.184-.318-.02-.49.14-.65.143-.142.317-.37.475-.556.16-.185.212-.318.318-.53.106-.213.053-.398-.027-.557-.08-.16-.712-1.716-.976-2.35-.257-.617-.518-.534-.712-.543a13.7 13.7 0 0 0-.607-.011c-.212 0-.556.08-.847.398-.29.317-1.11 1.086-1.11 2.65 0 1.563 1.137 3.073 1.296 3.286.16.212 2.238 3.417 5.423 4.79.758.327 1.35.523 1.812.67.762.242 1.454.208 2.002.126.61-.091 1.877-.767 2.142-1.508.264-.741.264-1.376.185-1.508-.08-.132-.29-.212-.607-.371Z"
        />
      </svg>
    </a>
  );
}
