import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_AWAY, asksToAsk, faqAnswer, looksLikeQuestion, QUESTION_FORWARDED } from "./customer-faq.js";
import { isOfficeInfo } from "./chat-words.js";
import { FrontDoorService } from "./front-door.service.js";
import { MENU_TEXT } from "./wa-smart.js";

const PHONE = "919000008888";

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
});
afterEach(() => vi.restoreAllMocks());

describe("everyday questions, in every kind of writing", () => {
  it.each([
    ["gawah kitne chahiye", "witness"],
    ["गवाह कितने लगेंगे", "witness"],
    ["How many witnesses are required?", "witness"],
    ["mahila ke naam par registry me chhoot milti hai kya", "woman"],
    ["पत्नी के नाम रजिस्ट्री सस्ती पड़ेगी क्या", "woman"],
    ["Is stamp duty less for women?", "woman"],
    ["stamp duty kitni hai", "rates"],
    ["स्टाम्प ड्यूटी कितने प्रतिशत है", "rates"],
    ["registry me kitna time lagta hai", "how-long"],
    ["रजिस्ट्री कितने दिन में हो जाएगी", "how-long"],
    ["kya mujhe office aana padega", "in-person"],
    ["क्या घर से रजिस्ट्री हो सकती है", "in-person"],
    ["geo tag photo kya hai", "geotag"],
    ["जियो टैग फोटो कैसे लें", "geotag"],
    ["aadhar card zaroori hai kya", "id"],
    ["pan card nahi hai to", "id"],
    ["vasiyat banwani hai", "other-doc"],
    ["दान पत्र बनवाना है", "other-doc"],
    ["Can you do a gift deed?", "other-doc"],
    ["power of attorney chahiye", "other-doc"],
    ["bhai ke naam property transfer karni hai", "other-doc"],
    ["payment kaise karna hai", "payment"],
    ["cheque chalega kya", "payment"],
    ["slot kaise book hoga", "slot"],
    ["kya aap online registry karte ho", "slot"],
    ["kya registry cancel ho sakti hai", "registry-cancel"],
    ["khasra kahan milega", "khasra"],
    ["seller mar gaya to kya hoga", "seller-died"],
    ["विक्रेता की मृत्यु हो गई है अब रजिस्ट्री कैसे होगी", "seller-died"],
    ["papa ki death ho gayi, makan bechna hai", "seller-died"],
    ["malik guzar gaye plot kaise bikega", "seller-died"],
    ["The seller passed away, what now?", "seller-died"],
  ])("%s → %s", (text, topic) => {
    expect(faqAnswer(text)?.topic).toBe(topic);
  });

  it.each(["hi", "1", "registry karwani hai", "makan bechna hai", "mera kam kab hoga", "ok", "plot ka naksha pass kaise hoga", "रजिस्ट्री करवानी है"])(
    "%s → not an everyday question",
    (text) => {
      expect(faqAnswer(text)).toBeNull();
    },
  );

  it("a dead seller: heirs' mutation first (about 30-40 days), then the registry; the owner is told", () => {
    const a = faqAnswer("seller mar gaya to kya hoga")!;
    expect(a.text).toContain("कानूनी वारिसों");
    expect(a.text).toContain("नामांतरण");
    expect(a.text).toContain("30-40 दिन");
    expect(a.text).toContain("उसके बाद वारिस मिलकर रजिस्ट्री");
    expect(a.alert).toBeTruthy();
    expect(faqAnswer("market rate kya hai")?.topic).not.toBe("seller-died");
    expect(faqAnswer("deadline kab hai")?.topic).not.toBe("seller-died");
  });

  it("the woman / rate answers use the estimate's own figures", () => {
    const w = faqAnswer("mahila ke naam chhoot")!.text;
    expect(w).toContain("1%");
    expect(w).toContain("3%");
    expect(faqAnswer("stamp duty kitni hai")!.text).toContain("नगर निगम क्षेत्र 9.5%, अन्य क्षेत्र 6.5%");
  });

  it("asking to ask, a real question, and office hours without the word office", () => {
    expect(asksToAsk("hello sir mujhe ek sawal puchna hai")).toBe(true);
    expect(asksToAsk("ek baat batao")).toBe(true);
    expect(asksToAsk("seller mar gaya to kya hoga")).toBe(false);
    expect(looksLikeQuestion("seller mar gaya to kya hoga")).toBe(true);
    expect(looksLikeQuestion("hello")).toBe(false);
    expect(looksLikeQuestion("ganga vihar")).toBe(false);
    for (const t of ["kitne baje aau", "kya sunday ko khula hai", "kal khula rahega kya"]) expect(isOfficeInfo(t)).toBe(true);
  });
});

function world() {
  const contacts = new Map<string, any>();
  const prisma: any = new Proxy(
    {
      waContact: {
        findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null,
        upsert: async ({ where, create, update }: any) => {
          const c = contacts.get(where.phone);
          contacts.set(where.phone, c ? { ...c, ...update } : { gibberishStreak: 0, ...create });
        },
        update: async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data }),
        updateMany: async () => ({ count: 1 }),
      },
      waOfficeFeeConfig: { findUnique: async () => null },
    } as any,
    { get: (t, k) => t[k] ?? { findMany: async () => [], findFirst: async () => null, count: async () => 0 } },
  );
  const outbox = { alertOwners: vi.fn(async () => 1), post: vi.fn(async () => ({ ok: false })) };
  const front = new FrontDoorService(
    prisma,
    outbox as any,
    { extract: async () => null } as any,
    { lookup: async () => null } as any,
    {} as any,
    { reply: async () => null } as any,
    { settings: async () => DEFAULT_ATTENDANCE_SETTINGS, holidays: async () => [] } as any,
  );
  return { contacts, outbox, say: (t: string, now?: Date) => front.handle(PHONE, t, async () => null, now) };
}

describe("conversations", () => {
  it("a question the bot cannot answer goes to the owner (numbers masked), once per 5 minutes; the customer is told", async () => {
    const w = world();
    const t0 = new Date("2026-10-06T06:00:00Z");
    const r = await w.say("NRI buyer kaise sign karega, aadhar 1234 5678 9012", t0);
    expect(r).toMatchObject({ replies: [QUESTION_FORWARDED], route: "question-forwarded", force: true });
    const alert = String((w.outbox.alertOwners.mock.calls as unknown[][])[0]![0]);
    expect(alert).toContain("+91 90000 08888");
    expect(alert).toContain("[NUMBER]");
    expect(alert).not.toContain("5678");
    await w.say("NRI kaise sign karega?", new Date(t0.getTime() + 60_000));
    expect(w.outbox.alertOwners).toHaveBeenCalledTimes(1);
    await w.say("NRI kaise sign karega?", new Date(t0.getTime() + 6 * 60_000));
    expect(w.outbox.alertOwners).toHaveBeenCalledTimes(2);
  });

  it("a question about a registry is sent on too, with the draft how-to", async () => {
    const w = world();
    const r = await w.say("kya NRI ki registry ho sakti hai");
    expect(r.route).toBe("draft-question");
    expect(r.replies[0]).toContain("स्टाफ को भेज दिया");
    expect(w.outbox.alertOwners).toHaveBeenCalledTimes(1);
    expect((await w.say("registry karwani hai")).route).toBe("draft-howto");
  });

  it("an everyday question in the middle of the cost questions keeps them open", async () => {
    const w = world();
    await w.say("2");
    await w.say("1");
    expect((await w.say("gawah kitne chahiye")).route).toBe("faq-witness");
    expect((await w.say("20 lakh")).replies.join("\n")).toContain("₹20,00,000");
  });

  it("'dan patra' at the cost document question still answers it", async () => {
    const w = world();
    await w.say("2");
    expect((await w.say("dan patra")).replies[0]).toContain("कार्यालय शुल्क");
  });

  it("'मुझे एक सवाल पूछना है' → ask away; 'hi' → menu", async () => {
    const w = world();
    expect((await w.say("sir mujhe ek sawal puchna hai")).replies).toEqual([ASK_AWAY]);
    expect((await w.say("hi")).replies).toEqual([MENU_TEXT]);
  });
});
