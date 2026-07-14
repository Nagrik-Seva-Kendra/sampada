import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DocumentChecklist } from "./DocumentChecklist";
import { CallbackForm } from "./CallbackForm";

// Same office address/number used in the footer map + WhatsApp fab — kept as
// one source of truth per component since none of these are user-editable.
const OFFICE_ADDRESS =
  "G-11,12 Millenium Plaza, University Road, Govindpuri, Gwalior, Madhya Pradesh 474011";
const PHONE_DIGITS = "917898475648";
const EMAIL = "anujshrm325@gmail.com";
const MAP_DIRECTIONS_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(OFFICE_ADDRESS)}`;
const WHATSAPP_LINK = `https://wa.me/${PHONE_DIGITS}`;

export function ContactPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {L("Get in touch", "संपर्क करें")}
        </div>
        <h2 className="page-title">{L("Contact Us", "हमसे संपर्क करें")}</h2>
        <p className="er-sub">
          {L(
            "Questions about a deed, a guideline rate, or your registration? Reach us any of the ways below — or simply walk in to the office.",
            "किसी विलेख, गाइडलाइन दर या रजिस्ट्रेशन से जुड़ा सवाल है? नीचे दिए किसी भी तरीके से हमसे संपर्क करें — या सीधे हमारे ऑफिस आ जाएं।",
          )}
        </p>

        <div className="contact-grid">
          <div className="contact-form">
            <h3>{L("Reach us directly", "सीधे संपर्क करें")}</h3>
            <a className="btn-calc" href={WHATSAPP_LINK} target="_blank" rel="noreferrer">
              {L("Chat on WhatsApp", "व्हाट्सएप पर चैट करें")}
            </a>
            <a className="doc-btn" href={`tel:+${PHONE_DIGITS}`}>
              📞 {L("Call", "कॉल करें")} — {t("phone")}
            </a>
            <a className="doc-btn" href={`mailto:${EMAIL}`}>
              ✉️ {EMAIL}
            </a>
            <a className="doc-btn" href={MAP_DIRECTIONS_LINK} target="_blank" rel="noreferrer">
              📍 {L("Get directions", "दिशा-निर्देश पाएं")}
            </a>
          </div>

          <div className="contact-info">
            <p>
              <strong>{t("brandName")}</strong>
            </p>
            <p style={{ whiteSpace: "pre-line" }}>{t("brandSub")}</p>
            <p>{t("phone")}</p>
            <p>{t("email")}</p>
            <p>{L("Open Mon–Sat, 10 AM – 7 PM", "सोम–शनि, सुबह 10 बजे – शाम 7 बजे तक खुला")}</p>
          </div>

                    <CallbackForm />
                    <DocumentChecklist />
        </div>
      </div>
    </section>
  );
}
