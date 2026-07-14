import { createElement, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { useLang } from "../../stores/uiStore";

const PHONE_NUMBER = "917898475648";

type Bi = { en: string; hi: string };

const TITLE: Bi = { en: "Request a Callback", hi: "कॉलबैक का अनुरोध करें" };
const NAME_LABEL: Bi = { en: "Your name", hi: "आपका नाम" };
const PHONE_LABEL: Bi = { en: "Phone number", hi: "फ़ोन नंबर" };
const SUBMIT_LABEL: Bi = { en: "Request Callback on WhatsApp", hi: "व्हाट्सएप पर कॉलबैक अनुरोध करें" };
const HINT: Bi = {
    en: "We will message you on WhatsApp to confirm the callback.",
    hi: "हम कॉलबैक की पुष्टि के लिए आपको व्हाट्सएप पर संदेश भेजेंगे।",
};

/**
 * Simple callback-request form. There is no backend endpoint for this yet,
 * so submitting opens a pre-filled WhatsApp message to the office number
 * instead of posting anywhere -- zero new infrastructure required.
 */
export function CallbackForm() {
    const lang = useLang();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");

  const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const text = `Hi, I would like a callback.\nName: ${name || "-"}\nPhone: ${phone || "-"}`;
        const url = `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank", "noreferrer");
  };

  return createElement(
        "div",
    { className: "contact-form", style: { marginTop: 20 } },
        createElement("h3", null, TITLE[lang]),
        createElement(
                "form",
          { onSubmit: handleSubmit, className: "modal-form" },
                createElement(
                          "label",
                  { className: "modal-field" },
                          NAME_LABEL[lang],
                          createElement("input", {
                                      type: "text",
                                      value: name,
                                      onChange: (e: ChangeEvent<HTMLInputElement>) => setName(e.target.value),
                                      placeholder: NAME_LABEL[lang],
                          })
                        ),
                createElement(
                          "label",
                  { className: "modal-field" },
                          PHONE_LABEL[lang],
                          createElement("input", {
                                      type: "tel",
                                      value: phone,
                                      onChange: (e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value),
                                      placeholder: "+91 XXXXX XXXXX",
                          })
                        ),
                createElement(
                          "button",
                  { type: "submit", className: "btn-calc modal-submit" },
                          SUBMIT_LABEL[lang]
                        )
              ),
        createElement(
                "p",
          { className: "contact-ok", style: { opacity: 0.75, marginTop: 10 } },
                HINT[lang]
              )
      );
}
