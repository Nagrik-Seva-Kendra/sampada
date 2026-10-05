import { createHash } from "node:crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { DEFAULT_OFFICE_FEES, WA_STATUS_PHRASE, WaOfficeFees } from "@sampada/shared";
import { AttendanceService } from "../attendance/attendance.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { parseDue } from "../tasks/task-rules.js";
import { inOfficeHours, nextOpening, officeCallNumber, saysAsap, showNumber, whenHi } from "./call-rules.js";
import { CallbackService } from "./callback.service.js";
import { FollowUpService } from "./followup.service.js";
import { ArchiveCopyService } from "./archive-copy.service.js";
import { SatisfactionService } from "./satisfaction.service.js";
import { DeedExtractorService } from "./deed-extractor.service.js";
import type { IncomingFile } from "./draft-intake.service.js";
import { GuidelineLookupService } from "./guideline-lookup.service.js";
import { normDigits, parseAmount } from "./intake-rules.js";
import { requestLink } from "./wa-alerts.js";
import { deleteMedia } from "./wa-media.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import {
  COST_AMOUNT_ASK,
  COST_KIND_ASK,
  flatFeeText,
  isAbusive,
  isGibberish,
  isGreeting,
  MENU_TEXT,
  menuText,
  parseCostKind,
  parseMenuChoice,
  registryCostText,
} from "./wa-smart.js";
import { maskPhone } from "./webhook-diagnostics.js";

export const SPAM_PER_MINUTE = 20;
export const NO_REPEAT_MS = 10 * 60 * 1000;
export const GIBBERISH_MUTE_MS = 30 * 60 * 1000;
export const GIBBERISH_NOTICE = "लगता है संदेश गलती से गया। मदद के लिए मेनू का नंबर (1, 2, 3 या 4) लिखें।";
export const DRAFT_HOWTO =
  "ड्राफ्ट के लिए कृपया पुरानी रजिस्ट्री की PDF या सभी पन्नों की साफ़ फ़ोटो भेजें।\n" +
  "बंधक पत्र के लिए बैंक का सैंक्शन लेटर और जिस संपत्ति को बंधक रखना है उसकी रजिस्ट्री भेजें।";
export const STAFF_REPLY = "ठीक है, हमारा स्टाफ जल्द आपसे संपर्क करेगा। कार्यालय फ़ोन: 78984 75648";

/** Customer-facing phrase for every work status (menu 3). */
const STATUS_PHRASE: Record<string, string> = {
  NEW: "दर्ज हो गया है, स्टाफ जल्द काम शुरू करेगा",
  CUSTOMER_APPROVED: "आपकी पुष्टि मिल गई है, आगे की प्रक्रिया जारी है",
  CORRECTION_REQUESTED: "आपका सुधार दर्ज है, स्टाफ सुधार कर रहा है",
  ...WA_STATUS_PHRASE,
};

export type FrontRoute =
  | "menu"
  | "greeting"
  | "draft-howto"
  | "cost"
  | "status"
  | "staff"
  | "gibberish"
  | "gibberish-muted"
  | "deed-words"
  | "call"
  | "callback"
  | "followup"
  | "copy"
  | "satisfaction";
export interface FrontReply {
  replies: string[];
  route: FrontRoute;
}

type State =
  | { mode: "cost"; step: "KIND" | "AMOUNT"; guideline?: { value: number; sdPct: number } | null }
  | { mode: "call"; step: "CHOICE" }
  | { mode: "callback"; step: "WHEN" }
  | { mode: "callback"; step: "PURPOSE"; at: string | null; atText: string | null }
  | null;

export const CALL_CHOICE_TEXT = "1. मैं अभी ऑफिस को कॉल करूँगा\n2. ऑफिस मुझे कॉल करे (कॉल बैक)";
export const CALLBACK_WHEN_ASK = 'आपको कब कॉल करें? जैसे "आज 4 बजे", "कल सुबह" — या "अभी" लिखें।';
export const CALLBACK_PURPOSE_ASK = "किस काम के लिए बात करनी है? छोटे में लिखें (जैसे: रजिस्ट्री की तारीख, बंधक, नामांतरण)।";
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * The bot's front door for numbers with no draft conversation going on: the
 * menu (1 ड्राफ्ट, 2 खर्च/गाइडलाइन, 3 मेरा काम, 4 स्टाफ), gibberish and
 * spam/abuse handling, and "never the same reply twice in 10 minutes".
 * State lives on WaContact; message rates are counted in memory (one API
 * instance). Logs carry masked numbers and routes only -- never text.
 */
@Injectable()
export class FrontDoorService {
  private readonly log = new Logger("WhatsappFrontDoor");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WaOutboxService,
    private readonly extractor: DeedExtractorService,
    private readonly guideline: GuidelineLookupService,
    private readonly callbacks: CallbackService,
    private readonly followups: FollowUpService,
    private readonly attendance: AttendanceService,
    @Optional() private readonly copies?: ArchiveCopyService,
    @Optional() private readonly satisfaction?: SatisfactionService,
  ) {}

  private callNumber(): string | null {
    return officeCallNumber();
  }

  // ---------- spam / abuse ----------
  /** Every incoming message: false = stay silent (blocked, or this one made it spam). */
  async allowInbound(phone: string, now = Date.now()): Promise<boolean> {
    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    if (c?.blockedAt) return false;
    const times = (this.recent.get(phone) ?? []).filter((t) => now - t < 60_000);
    times.push(now);
    this.recent.set(phone, times);
    if (times.length >= SPAM_PER_MINUTE) {
      await this.block(phone, "spam");
      return false;
    }
    return true;
  }

  async isBlocked(phone: string): Promise<boolean> {
    return !!(await this.prisma.waContact.findUnique({ where: { phone } }))?.blockedAt;
  }

  /** Abusive words → block + owner alert; true when blocked. */
  async checkAbuse(phone: string, text: string): Promise<boolean> {
    if (!isAbusive(text)) return false;
    await this.block(phone, "abuse");
    return true;
  }

  async block(phone: string, reason: "spam" | "abuse"): Promise<void> {
    await this.prisma.waContact.upsert({
      where: { phone },
      create: { phone, lastInboundAt: new Date(), organizationId: this.orgId || null, blockedAt: new Date(), blockReason: reason },
      update: { blockedAt: new Date(), blockReason: reason, organizationId: this.orgId || null },
    });
    this.recent.delete(phone);
    this.log.warn(`${maskPhone(phone)} blocked (${reason})`);
    await this.outbox
      .alertOwners(
        `⚠️ WhatsApp नंबर ${maskPhone(phone)} को बॉट ने ${reason === "spam" ? "बहुत ज़्यादा संदेशों (स्पैम)" : "अपशब्दों"} के कारण रोक दिया है। ` +
          `ज़रूरत हो तो खोलें: ${requestLink("").replace(/\/$/, "")}`,
      )
      .catch(() => undefined);
  }

  // ---------- replies ----------
  /** Drops replies already sent to this number in the last 10 minutes, and remembers the rest. */
  async withoutRepeats(phone: string, replies: string[], now = Date.now()): Promise<string[]> {
    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    const kept = ((c?.recentReplies as { h: string; at: number }[] | null) ?? []).filter((r) => now - r.at < NO_REPEAT_MS);
    const out: string[] = [];
    for (const r of replies) {
      const h = hash(r);
      if (kept.some((k) => k.h === h)) continue;
      kept.push({ h, at: now });
      out.push(r);
    }
    await this.prisma.waContact
      .update({ where: { phone }, data: { recentReplies: kept.slice(-30) } })
      .catch(() => undefined);
    return out;
  }

  /** A real (non-gibberish) message ends a gibberish streak / mute. */
  async clearGibberish(phone: string): Promise<void> {
    await this.prisma.waContact.updateMany({ where: { phone, OR: [{ gibberishStreak: { gt: 0 } }, { mutedUntil: { not: null } }] }, data: { gibberishStreak: 0, mutedUntil: null } });
  }

  /**
   * A text (already debounced) from a number with no draft conversation.
   * `deedWords` is the old intake reply for messages like "बंधक बनाना है".
   */
  async handle(phone: string, text: string, deedWords: () => Promise<string[] | null>, now = new Date()): Promise<FrontReply> {
    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    const state = (c?.state as State) ?? null;

    if (isGibberish(text)) {
      if (c?.mutedUntil && c.mutedUntil > now) return { replies: [], route: "gibberish-muted" };
      const streak = (c?.gibberishStreak ?? 0) + 1;
      const mute = streak >= 3;
      await this.setContact(phone, { gibberishStreak: mute ? 0 : streak, mutedUntil: mute ? new Date(now.getTime() + GIBBERISH_MUTE_MS) : null });
      return { replies: [mute ? GIBBERISH_NOTICE : menuText(!!this.callNumber())], route: "gibberish" };
    }
    await this.clearGibberish(phone);

    const callOn = !!this.callNumber();
    const choice = parseMenuChoice(text, callOn);
    // Rating / feedback after DONE, "सुधार: ...", "चेकलिस्ट".
    const sat = this.satisfaction ? await this.satisfaction.handle(phone, text, now) : null;
    if (sat) return { replies: sat, route: "satisfaction" };
    // "पुरानी रजिस्ट्री की कॉपी" (code, then the deed to send).
    const copy = this.copies ? await this.copies.handle(phone, text, now) : null;
    if (copy) return { replies: copy, route: "copy" };
    // "बंद" / "हाँ करवाना है" after a follow-up reminder.
    const fu = await this.followups.reply(phone, text, now);
    if (fu) {
      await this.setContact(phone, { state: null });
      return { replies: fu, route: "followup" };
    }
    if (state?.mode === "call" || state?.mode === "callback") {
      // A bare menu number other than the call answers, or words of another option, leave the call questions.
      const leaves =
        choice !== null &&
        choice !== 5 &&
        ((state.mode === "call" && choice >= 3) || (state.mode === "callback" && state.step === "WHEN"));
      if (!leaves) return this.call(phone, state, text, now);
    }
    if (state?.mode === "cost") {
      // Inside the cost questions a bare number answers them ("1" = रजिस्ट्री); words of
      // another menu option ("स्टाफ से बात") or "4" switch to that option instead.
      const bareDigit = /^\s*[1-4]\s*$/.test(normDigits(text));
      const switches = (choice !== null && !bareDigit) || (bareDigit && choice === 4);
      if (!switches) return this.cost(phone, state, text);
    }

    switch (choice) {
      case 1:
        await this.setContact(phone, { state: null });
        return { replies: [DRAFT_HOWTO], route: "draft-howto" };
      case 2:
        await this.setContact(phone, { state: { mode: "cost", step: "KIND" } });
        return { replies: [COST_KIND_ASK], route: "cost" };
      case 3:
        await this.setContact(phone, { state: null });
        return { replies: [await this.myRequests(phone)], route: "status" };
      case 5:
        if (callOn) return this.callMenu(phone);
        break;
      case 4:
        await this.setContact(phone, { state: null });
        await this.outbox.alertOwners(`📞 WhatsApp नंबर ${maskPhone(phone)} स्टाफ से बात करना चाहते हैं (+${phone}).`).catch(() => undefined);
        return { replies: [STAFF_REPLY], route: "staff" };
    }

    const ref = text.trim().match(/^#?([a-z0-9]{6})$/i)?.[1];
    if (ref) {
      const one = await this.myRequests(phone, ref);
      if (one) return { replies: [one], route: "status" };
    }
    if (!isGreeting(text)) {
      const r = await deedWords();
      if (r) return { replies: r, route: "deed-words" };
    }
    return { replies: [menuText(callOn)], route: isGreeting(text) ? "greeting" : "menu" };
  }

  // ---------- call (menu 5) ----------
  /** Menu 5: buttons inside the 24h window (the customer just wrote), else numbered text. */
  private async callMenu(phone: string): Promise<FrontReply> {
    const n = this.callNumber()!;
    await this.setContact(phone, { state: { mode: "call", step: "CHOICE" } });
    const body = `📞 ऑफिस का नंबर: ${showNumber(n)}\nआप क्या चाहेंगे?`;
    if (process.env.WA_ACCESS_TOKEN) {
      const r = await this.outbox.post(phone, {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: [
              { type: "reply", reply: { id: "call:now", title: "मैं अभी कॉल करूँगा" } },
              { type: "reply", reply: { id: "call:back", title: "मुझे कॉल बैक करें" } },
            ],
          },
        },
      });
      if (r.ok) return { replies: [], route: "call" };
    }
    return { replies: [`${body}\n${CALL_CHOICE_TEXT}`], route: "call" };
  }

  /** A call button ("call:now" / "call:back"); null for other buttons. */
  async callButton(phone: string, id: string, now = new Date()): Promise<string[] | null> {
    if (!this.callNumber() || (id !== "call:now" && id !== "call:back")) return null;
    const r = await this.call(phone, { mode: "call", step: "CHOICE" }, id === "call:now" ? "1" : "2", now);
    return r.replies;
  }

  private async call(phone: string, state: Extract<NonNullable<State>, { mode: "call" | "callback" }>, text: string, now: Date): Promise<FrontReply> {
    const v = normDigits(text).trim();
    const n = this.callNumber();
    if (state.mode === "call") {
      if (/^1[.)]?$|अभी कॉल|abhi call|मैं कॉल|main call|now/i.test(v) && n) {
        await this.setContact(phone, { state: null });
        const open = await this.isOpen(now);
        return {
          replies: [`📞 कृपया ${showNumber(n)} पर कॉल करें।${open ? "" : `\nऑफिस अभी बंद है — ${whenHi(await this.opening(now), now)} के बाद कॉल करें।`}`],
          route: "call",
        };
      }
      if (/^2[.)]?$|कॉल ?बैक|call ?back|मुझे कॉल|mujhe call/i.test(v)) {
        await this.setContact(phone, { state: { mode: "callback", step: "WHEN" } });
        return { replies: [CALLBACK_WHEN_ASK], route: "callback" };
      }
      return { replies: [`कृपया 1 या 2 लिखें:\n${CALL_CHOICE_TEXT}`], route: "call" };
    }
    if (state.step === "WHEN") {
      let at: Date | null = null;
      if (!saysAsap(v)) {
        at = parseDue(v, now);
        // "9 बजे रात" / "7 बजे शाम": evening hours.
        if (at && /रात|raat|शाम|shaam|sham|evening|night/i.test(v) && Number(at.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })) < 12) {
          at = new Date(at.getTime() + 12 * 3600 * 1000);
        }
        if (!at) return { replies: ['समय समझ नहीं आया। जैसे "आज 4 बजे", "कल सुबह" लिखें, या "अभी" लिखें।'], route: "callback" };
        if (at < now) at = null;
      }
      await this.setContact(phone, { state: { mode: "callback", step: "PURPOSE", at: at?.toISOString() ?? null, atText: saysAsap(v) ? null : v.slice(0, 100) } });
      return { replies: [CALLBACK_PURPOSE_ASK], route: "callback" };
    }
    // PURPOSE
    if (v.length < 2) return { replies: [CALLBACK_PURPOSE_ASK], route: "callback" };
    let at = state.at ? new Date(state.at) : null;
    const { hours, holidays } = await this.hours();
    let when: string;
    if (!at) {
      when = inOfficeHours(now, hours, holidays)
        ? "स्टाफ जल्द आपको कॉल करेगा।"
        : `ऑफिस अभी बंद है (समय ${hours.startTime}–${hours.endTime})। आपको ${whenHi(nextOpening(now, hours, holidays), now)} के बाद कॉल आएगा।`;
    } else if (!inOfficeHours(at, hours, holidays)) {
      at = nextOpening(at, hours, holidays);
      when = `यह समय ऑफिस के समय (${hours.startTime}–${hours.endTime}) से बाहर है — आपको ${whenHi(at, now)} के बाद कॉल आएगा।`;
    } else when = `आपको ${whenHi(at, now)} के आसपास कॉल आएगा।`;
    const cb = await this.callbacks.create({ phone, preferredAt: at, preferredText: state.atText, purpose: v, source: "whatsapp" });
    await this.setContact(phone, { state: null });
    return { replies: [`✅ कॉल बैक दर्ज हो गया (नंबर ${cb.number})।\n${when}`], route: "callback" };
  }

  private async hours() {
    const s = await this.attendance.settings(this.orgId);
    const holidays = (await this.attendance.holidays(this.orgId)).map((h) => h.date);
    return { hours: s, holidays };
  }
  private async isOpen(now: Date) {
    const { hours, holidays } = await this.hours();
    return inOfficeHours(now, hours, holidays);
  }
  private async opening(now: Date) {
    const { hours, holidays } = await this.hours();
    return nextOpening(now, hours, holidays);
  }

  /** A file while the cost questions are open: read the registry, quote with the guideline value, delete the file. */
  async handleDocument(phone: string, file: IncomingFile): Promise<FrontReply | null> {
    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    const state = (c?.state as State) ?? null;
    if (state?.mode !== "cost") return null;
    const deed = await this.extractor.extract(file.buf, file.mime).catch(() => null);
    // Not part of any request: the customer's file is not kept.
    await deleteMedia(file.key).catch(() => this.log.warn(`cost: uploaded file not deleted (${maskPhone(phone)})`));
    const g = deed?.property ? await this.guideline.lookup(deed.property, { owners: deed.buyers?.length }).catch(() => null) : null;
    if (!g) {
      await this.setContact(phone, { state: { mode: "cost", step: "AMOUNT", guideline: null } });
      return { replies: ["इस दस्तावेज़ से गाइडलाइन अपने-आप नहीं मिल पाई।\n" + COST_AMOUNT_ASK], route: "cost" };
    }
    const guideline = { value: g.marketValue, sdPct: g.stamp.sdPct };
    await this.setContact(phone, { state: { mode: "cost", step: "AMOUNT", guideline } });
    const fees = await this.fees();
    return {
      replies: [
        registryCostText({ amount: null, guideline }, fees),
        "रजिस्ट्री गाइडलाइन से ज़्यादा राशि पर होगी तो वह राशि लिखें, अनुमान उसी पर बता देंगे।",
      ],
      route: "cost",
    };
  }

  private async cost(phone: string, state: Extract<NonNullable<State>, { mode: "cost" }>, text: string): Promise<FrontReply> {
    const fees = await this.fees();
    if (state.step === "KIND") {
      const kind = parseCostKind(text);
      if (!kind) return { replies: [COST_KIND_ASK], route: "cost" };
      if (kind === "registry") {
        await this.setContact(phone, { state: { mode: "cost", step: "AMOUNT" } });
        return { replies: [COST_AMOUNT_ASK], route: "cost" };
      }
      await this.setContact(phone, { state: null });
      return { replies: [flatFeeText(kind, fees)], route: "cost" };
    }
    const amount = parseAmount(text);
    if (!amount) return { replies: ["राशि समझ नहीं आई। जैसे 1500000 या 15 लाख लिखें, या पुरानी रजिस्ट्री की PDF/फ़ोटो भेजें।"], route: "cost" };
    await this.setContact(phone, { state: null });
    return { replies: [registryCostText({ amount, guideline: state.guideline ?? null }, fees)], route: "cost" };
  }

  /** This number's own requests only (menu 3); with `ref`, just that one or null. */
  private async myRequests(phone: string, ref?: string): Promise<string> {
    const rows = await this.prisma.draftIntake.findMany({
      where: { ...(this.orgId ? { organizationId: this.orgId } : {}), phone, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: ref ? 50 : 3,
      select: { id: true, workStatus: true, phone: true },
    });
    const mine = rows.filter((r) => r.phone === phone);
    const line = (r: { id: string; workStatus: string | null }) =>
      `अनुरोध ${r.id.slice(-6).toUpperCase()} — ${STATUS_PHRASE[r.workStatus ?? "NEW"] ?? STATUS_PHRASE.NEW}`;
    if (ref) {
      const hit = mine.find((r) => r.id.slice(-6).toUpperCase() === ref.toUpperCase());
      return hit ? line(hit) : "";
    }
    if (!mine.length) return 'इस नंबर से अभी कोई अनुरोध दर्ज नहीं है। नया ड्राफ्ट बनवाने के लिए "1" लिखें।';
    return ["आपके अनुरोध:", ...mine.map(line)].join("\n");
  }

  // ---------- office fees (owner-editable) ----------
  async fees(orgId = this.orgId): Promise<WaOfficeFees> {
    const row = orgId ? await this.prisma.waOfficeFeeConfig.findUnique({ where: { organizationId: orgId } }).catch(() => null) : null;
    const parsed = WaOfficeFees.safeParse(row?.config);
    return parsed.success ? parsed.data : DEFAULT_OFFICE_FEES;
  }

  private async setContact(phone: string, data: Record<string, unknown>): Promise<void> {
    await this.prisma.waContact.upsert({
      where: { phone },
      create: { phone, lastInboundAt: new Date(), ...(data as any) },
      update: data as any,
    });
  }
}
