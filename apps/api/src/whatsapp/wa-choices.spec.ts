import { describe, expect, it } from "vitest";
import { TASK_OR_QUESTION } from "../tasks/task-rules.js";
import { CALL_CHOICE_TEXT } from "./front-door.service.js";
import { GUIDE_ASK_HOUSE_KIND, GUIDE_ASK_LIFT, GUIDE_ASK_TYPE, pickText } from "./guideline-chat.js";
import { learnedReplyText } from "./customer-questions.js";
import { nudgeText } from "./lead-nudge.js";
import { choicesOf, interactivePayload, tappedText } from "./wa-choices.js";
import { COST_KIND_ASK, MENU_TEXT, menuText } from "./wa-smart.js";
import { VOICE_NOT_HEARD } from "./whatsapp.service.js";

const ids = (t: string) => choicesOf(t)?.choices.map((c) => c.id) ?? null;

describe("which replies become tap menus", () => {
  it("every numbered menu the bot sends", () => {
    expect(ids(MENU_TEXT)).toEqual(["1", "2", "3", "4"]);
    expect(ids(menuText(true))).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(COST_KIND_ASK)).toEqual(["1", "2", "3"]);
    expect(ids(GUIDE_ASK_TYPE)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(ids(GUIDE_ASK_LIFT)).toEqual(["1", "2"]);
    expect(ids(GUIDE_ASK_HOUSE_KIND)?.[0]).toBe("1");
    expect(ids(TASK_OR_QUESTION)).toEqual(["1", "2"]);
    expect(ids(`कृपया 1 या 2 लिखें:\n${CALL_CHOICE_TEXT}`)).toEqual(["1", "2"]);
    expect(ids("खरीदार का संबंध चुनें — नंबर लिखें:\n1. पुत्र (पिता का नाम आगे पूछा जाएगा)\n2. पुत्री (पिता का नाम)\n3. पत्नी (पति का नाम)")).toEqual(["1", "2", "3"]);
    expect(ids("आपको कौन सा दस्तावेज़ बनवाना है? नंबर या नाम लिखें:\n1. विक्रय पत्र\n2. बंधक पत्र\n3. कोई और दस्तावेज़\n(बंद करने के लिए \"रद्द\" लिखें।)")).toEqual(["1", "2", "3"]);
  });

  it("guideline rows with 0 = none of these; one row = 'सही है तो 1'", () => {
    const row = { sno: 12, hi: "गंगा विहार कॉलोनी, थाटीपुर रोड के दोनों ओर की संपूर्ण आवासीय भूमि एवं उससे लगी गलियाँ", en: "", ward: "60", teh: "ग्वालियर", pr: 18500 } as any;
    const two = pickText([row, { ...row, sno: 13, ward: "61" }]);
    expect(ids(two)).toEqual(["1", "2", "0"]);
    expect(ids(pickText([row]))).toEqual(["1", "0"]);
    // The rows are long: they stay in the body, so the rate is still seen.
    const p: any = interactivePayload(choicesOf(two)!);
    expect(p.interactive.body.text).toContain("₹18,500/वर्गमीटर");
    expect(p.interactive.action.sections[0].rows.map((r: any) => r.id)).toEqual(["opt:1", "opt:2", "opt:0"]);
  });

  it("quoted options and the main-menu hints inside a sentence", () => {
    expect(choicesOf('कृपया "1" (सुबह) या "2" (दोपहर) लिखें।')?.choices).toEqual([
      { id: "1", label: "सुबह" },
      { id: "2", label: "दोपहर" },
    ]);
    expect(ids('नया ड्राफ्ट बनवाना हो तो "1" लिखें।')).toEqual(["1"]);
    expect(ids(VOICE_NOT_HEARD)).toEqual(["4"]);
    expect(ids(learnedReplyText("हाँ, हो जाएगा।"))).toEqual(["4"]);
    expect(ids(nudgeText("cost"))).toEqual(["4"]);
    expect(ids('आपके काम की स्थिति देखने के लिए "3" लिखें।')).toEqual(["3"]);
  });

  it("lists that are not menus stay text: papers, steps, task lists, amounts", () => {
    expect(choicesOf("ठीक है, बंधक पत्र बनाते हैं। इसके लिए ये दस्तावेज़ ज़रूरी हैं:\n1. बैंक का सैंक्शन लेटर\n2. जिस संपत्ति को बंधक रखना है उसकी रजिस्ट्री")).toBeNull();
    // Steps with a staff hint: tapping "1" would start a draft, so no buttons at all.
    expect(choicesOf("तरीका:\n1. पुरानी रजिस्ट्री भेजें\n2. पहचान पत्र भेजें\nकुछ पूछना हो तो 4 लिखें — हमारा स्टाफ बात करेगा।")).toBeNull();
    expect(choicesOf("आज के काम:\n1. रामलाल की रजिस्ट्री\n2. बंधक फ़ाइल\nपूरा होने पर \"हो गया 2\" लिखें।")).toBeNull();
    expect(choicesOf("रजिस्ट्री किस राशि पर होगी? राशि लिखें (जैसे 15 लाख)।")).toBeNull();
    expect(choicesOf("कृपया 1, 2 या 3 लिखें।")).toBeNull(); // no labels to show
    expect(choicesOf("धन्यवाद! आपका काम पूरा हो गया।")).toBeNull();
  });
});

describe("the WhatsApp payload", () => {
  it("2–3 short options → reply buttons; the body says tap or type", () => {
    const p: any = interactivePayload(choicesOf(GUIDE_ASK_LIFT)!);
    expect(p.interactive.type).toBe("button");
    expect(p.interactive.body.text).toBe("क्या बिल्डिंग में लिफ्ट है? नीचे से चुनें या नंबर लिखें:");
    expect(p.interactive.action.buttons.map((b: any) => b.reply)).toEqual([
      { id: "opt:1", title: "1. हाँ" },
      { id: "opt:2", title: "2. नहीं" },
    ]);
  });

  it("the main menu → a list; long options keep their full text in the description; WhatsApp limits kept", () => {
    const p: any = interactivePayload(choicesOf(menuText(true))!);
    expect(p.interactive.type).toBe("list");
    const rows = p.interactive.action.sections[0].rows;
    expect(rows.map((r: any) => r.id)).toEqual(["opt:1", "opt:2", "opt:3", "opt:4", "opt:5"]);
    expect(rows[3]).toEqual({ id: "opt:4", title: "4. स्टाफ से बात" });
    expect(rows[0].description).toBe("नई रजिस्ट्री / बंधक का ड्राफ्ट");
    for (const r of rows) {
      expect([...r.title].length).toBeLessThanOrEqual(24);
      expect([...(r.description ?? "")].length).toBeLessThanOrEqual(72);
    }
    expect([...p.interactive.action.button].length).toBeLessThanOrEqual(20);
    for (const t of [MENU_TEXT, COST_KIND_ASK, GUIDE_ASK_TYPE, TASK_OR_QUESTION, VOICE_NOT_HEARD]) {
      const q: any = interactivePayload(choicesOf(t)!);
      for (const b of q.interactive.action.buttons ?? []) expect([...b.reply.title].length).toBeLessThanOrEqual(20);
      for (const r of q.interactive.action.sections?.[0].rows ?? []) expect([...r.title].length).toBeLessThanOrEqual(24);
    }
  });

  it("a hint keeps the whole text as the body", () => {
    const p: any = interactivePayload(choicesOf(VOICE_NOT_HEARD)!);
    expect(p.interactive.body.text).toBe(VOICE_NOT_HEARD);
    expect(p.interactive.action.buttons[0].reply).toEqual({ id: "opt:4", title: "🧑‍💼 स्टाफ से बात" });
  });

  it("too long for an interactive message → plain text", () => {
    expect(interactivePayload({ body: "क".repeat(1100), choices: [{ id: "1", label: "हाँ" }, { id: "2", label: "नहीं" }] })).toBeNull();
  });

  it("a tap reads as the number; other buttons (calls, leave) are left alone", () => {
    expect(tappedText({ type: "button_reply", button_reply: { id: "opt:2", title: "2. नहीं" } })).toBe("2");
    expect(tappedText({ type: "list_reply", list_reply: { id: "opt:0", title: "0. इनमें से कोई नहीं" } })).toBe("0");
    expect(tappedText({ type: "button_reply", button_reply: { id: "call:now" } })).toBeNull();
    expect(tappedText({ type: "button_reply", button_reply: { id: "opt:x; drop" } })).toBeNull();
    expect(tappedText(undefined)).toBeNull();
  });
});
