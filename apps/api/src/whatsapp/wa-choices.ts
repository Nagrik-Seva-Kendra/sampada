/**
 * "नंबर लिखें" menus as WhatsApp buttons / a list (wa-choices.spec.ts): the
 * customer taps instead of typing. A tap comes back as the same number the
 * customer would have typed ("opt:2" → "2"), so every flow reads it exactly as
 * before, and typing still works. Pure.
 */

export interface Choice {
  /** The number the customer would type. */
  id: string;
  label: string;
  /** A hint button ("🧑‍💼 स्टाफ से बात"): shown without its number. */
  plain?: boolean;
}
export interface ChoiceMessage {
  /** The text without the option lines (the question, notes). */
  body: string;
  choices: Choice[];
  /** The whole reply: the body when an option does not fit a button / row. */
  text?: string;
}

const DEV = "०१२३४५६७८९";
const ascii = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));
const KEYCAP = /^([0-9])️?⃣/;
/** "1. नई रजिस्ट्री", "2) ...", "3 - ...", "4️⃣ ...". */
const OPTION_LINE = /^\s*(?:([0-9]{1,2})\s*[.)\-–:]\s+|([0-9])️?⃣\s*)(.+?)\s*$/;
/** A numbered block is a menu only when the text asks for its number ("नंबर लिखें", "1 या 2 लिखें"); a list of papers or steps is not. */
const NUMBER_ASK = /नंबर\s*(या\s*नाम\s*)?(लिख|चुन)|[0-9]\s*(,|या)\s*[0-9][^।\n]{0,25}लिख|सही है तो 1 लिख/;
const WRITE = /लिख/;
/** 'कृपया "1" (सुबह) या "2" (दोपहर) लिखें।' */
const QUOTED = /["“]([0-9])["”]\s*\(([^)]{1,40})\)/g;
/** Main-menu hints inside a sentence: 'नया ड्राफ्ट बनवाना हो तो "1" लिखें।', "4 लिखें — स्टाफ". */
const HINTS: { id: string; when: RegExp; label: string }[] = [
  { id: "1", when: /ड्राफ्ट/, label: "📝 नया ड्राफ्ट" },
  { id: "3", when: /स्थिति|कहाँ पहुँचा/, label: "📋 काम की स्थिति" },
  { id: "4", when: /स्टाफ/, label: "🧑‍💼 स्टाफ से बात" },
];

/** The options in a reply, or null when it does not ask for a number. */
export function choicesOf(text: string): ChoiceMessage | null {
  if (!text || !WRITE.test(text)) return null;
  const lines = text.split("\n");
  const options: Choice[] = [];
  const rest: string[] = [];
  let inBlock = false;
  let blockDone = false;
  for (const line of lines) {
    const m = blockDone ? null : ascii(line).match(OPTION_LINE);
    if (m) {
      const id = m[1] ?? m[2] ?? ascii(line).match(KEYCAP)?.[1];
      if (id != null && !options.some((o) => o.id === id)) {
        options.push({ id, label: m[3]!.trim() });
        inBlock = true;
        continue;
      }
    }
    if (inBlock) blockDone = true;
    rest.push(line);
  }
  // A real menu: 2..10 options, numbered in order (0 "none of these" may sit at the end).
  const body = rest.join("\n").trim();
  if (options.length >= 2 && options.length <= 10 && inOrder(options) && NUMBER_ASK.test(ascii(body))) return { body, choices: options, text: text.trim() };
  if (options.length) return null; // a numbered list that is not a menu: no buttons at all
  const quoted = [...ascii(text).matchAll(QUOTED)].map((m) => ({ id: m[1]!, label: m[2]!.trim() }));
  if (quoted.length >= 2 && new Set(quoted.map((q) => q.id)).size === quoted.length) return { body: text.trim(), choices: quoted };
  const hints: Choice[] = [];
  for (const sentence of ascii(text).split(/[।\n]/)) {
    const n = sentence.match(/["“]?([0-9])["”]?\s*लिख/)?.[1];
    const h = n && HINTS.find((x) => x.id === n && x.when.test(sentence));
    if (h && !hints.some((x) => x.id === h.id)) hints.push({ id: h.id, label: h.label, plain: true });
  }
  return hints.length ? { body: text.trim(), choices: hints } : null;
}

function inOrder(options: Choice[]): boolean {
  const nums = options.map((o) => Number(o.id)).filter((n) => n !== 0);
  const zero = options.findIndex((o) => o.id === "0");
  if (zero !== -1 && zero !== 0 && zero !== options.length - 1) return false;
  return nums.length >= 1 && nums.every((n, i) => n === nums[0]! + i) && nums[0]! <= 1 + (zero === -1 ? 0 : 1);
}

export const CHOICE_PREFIX = "opt:";
/** A tapped button / list row → the text the flows read ("2"); null for other buttons. */
export function tappedText(interactive: any): string | null {
  const id = String(interactive?.button_reply?.id ?? interactive?.list_reply?.id ?? "");
  return id.startsWith(CHOICE_PREFIX) && /^[0-9]{1,2}$/.test(id.slice(CHOICE_PREFIX.length)) ? id.slice(CHOICE_PREFIX.length) : null;
}

const cut = (s: string, n: number) => {
  const a = [...s];
  return a.length <= n ? s : `${a.slice(0, n - 1).join("")}…`;
};
const BODY_MAX = 1024;

/**
 * The Cloud API payload: up to 3 short options → reply buttons (title ≤ 20),
 * else a list (row title ≤ 24, the full option in the description ≤ 72).
 * null when the body is too long for an interactive message.
 */
export function interactivePayload(m: ChoiceMessage): Record<string, unknown> | null {
  const len = (x: string) => [...x].length;
  const titleOf = (c: Choice) => (c.plain ? c.label : `${c.id}. ${c.label}`);
  const asButtons = m.choices.length <= 3 && m.choices.every((c) => len(titleOf(c)) <= 20 || len(c.label) <= 20);
  // An option cut short (a guideline row with its rate): the full text stays in the body.
  const cutShort = asButtons ? false : m.choices.some((c) => len(titleOf(c)) > 24 && len(c.label) > 72);
  const body = ((cutShort && m.text) || m.body || "👇 नीचे से चुनें:").replace(/नंबर लिखें/, "नीचे से चुनें या नंबर लिखें");
  if (len(body) > BODY_MAX) return null;
  if (asButtons) {
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: m.choices.map((c) => ({ type: "reply", reply: { id: `${CHOICE_PREFIX}${c.id}`, title: len(titleOf(c)) <= 20 ? titleOf(c) : c.label } })),
        },
      },
    };
  }
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: "विकल्प चुनें",
        sections: [
          {
            title: "विकल्प",
            rows: m.choices.map((c) => {
              const title = titleOf(c);
              return len(title) <= 24
                ? { id: `${CHOICE_PREFIX}${c.id}`, title }
                : { id: `${CHOICE_PREFIX}${c.id}`, title: cut(title, 24), description: cut(c.label, 72) };
            }),
          },
        ],
      },
    },
  };
}
