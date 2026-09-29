import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { type DeedExtract, DeedExtractorService } from "./deed-extractor.service.js";
import { type GuidelineResult, GuidelineLookupService } from "./guideline-lookup.service.js";
import { decrypt, encrypt, mask } from "./pii-crypto.js";
import {
  inr,
  normDigits,
  parseAmount,
  taxFlags,
  taxNotice,
  validAadhaar,
  validEmail,
  validMobile,
  validPan,
  validText,
} from "./intake-rules.js";

type Ctx = { phone: string; name: string };
type Step = {
  key: string;
  label: string;
  ask: string;
  optional?: boolean;
  secret?: boolean;
  err?: string;
  validate: (v: string) => string | null;
};
export type IncomingFile = { key: string; buf: Buffer; mime: string };

const YES = /^(हाँ|हां|हा|ha|haan|han|yes|y|1|ok|ठीक है|ठीक)$/i;
const NO = /^(नहीं|नही|no|n|2|nahi|nahin)$/i;
const SKIP = /^(नहीं|नही|no|na|nahi|nahin|-|none)$/i;
const CANCEL = /^(रद्द|cancel|stop|बंद)$/i;

// ---------- questions asked before the amount (order = conversation order) ----------
const BUYER_STEPS: Step[] = [
  { key: "buyerName", label: "खरीदार", ask: "खरीदार (क्रेता) का पूरा नाम लिखें। सिर्फ़ नाम लिखें — पिता का नाम अगले सवाल में पूछा जाएगा।", validate: validText(), err: "कृपया पूरा नाम लिखें।" },
  { key: "buyerFatherName", label: "पिता/पति का नाम", ask: "खरीदार के पिता या पति का नाम लिखें।", validate: validText() },
  { key: "buyerMotherName", label: "माता का नाम", ask: "खरीदार की माता का नाम लिखें।", validate: validText() },
  { key: "buyerAadhaar", label: "आधार", ask: "खरीदार का 12 अंकों का आधार नंबर लिखें।", validate: validAadhaar, secret: true, err: "आधार नंबर सही नहीं लग रहा। कृपया जाँचकर दोबारा लिखें।" },
  { key: "buyerMobile", label: "मोबाइल", ask: "खरीदार का 10 अंकों का मोबाइल नंबर लिखें।", validate: validMobile, err: "मोबाइल नंबर सही नहीं है। 10 अंकों का नंबर लिखें।" },
  { key: "buyerEmail", label: "ईमेल", ask: "खरीदार की ईमेल ID लिखें। न हो तो \"नहीं\" लिखें।", validate: validEmail, optional: true, err: "ईमेल सही नहीं है। न हो तो \"नहीं\" लिखें।" },
  { key: "buyerAddress", label: "पता", ask: "खरीदार का पूरा पता लिखें।", validate: validText(8), err: "कृपया पूरा पता लिखें।" },
];
const PAN_STEP: Step = { key: "buyerPan", label: "खरीदार PAN", ask: "खरीदार का PAN नंबर लिखें।", validate: validPan, secret: true, err: "PAN सही नहीं है (जैसे ABCDE1234F)।" };
const SELLER_PAN_STEP: Step = { key: "sellerPan", label: "विक्रेता PAN", ask: "TDS के लिए विक्रेता का PAN नंबर लिखें।", validate: validPan, secret: true, err: "PAN सही नहीं है (जैसे ABCDE1234F)।" };
const ALL_STEPS = [...BUYER_STEPS, PAN_STEP, SELLER_PAN_STEP];
const AMOUNT_ASK = "रजिस्ट्री कितनी राशि पर बनानी है? राशि लिखें (जैसे 1500000 या 15 लाख), या \"गाइडलाइन\" लिखें।";

@Injectable()
export class DraftIntakeService {
  private readonly log = new Logger(DraftIntakeService.name);
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: DeedExtractorService,
    private readonly guideline: GuidelineLookupService,
  ) {}

  // ================= document received =================
  async handleDocument(ctx: Ctx, file: IncomingFile): Promise<string[]> {
    const cur = await this.active(ctx.phone);
    if (cur) {
      const data: any = { ...(cur.data as any) };
      data.extraDocs = [...(data.extraDocs ?? []), file.key];
      await this.save(cur.id, { data });
      return ["अतिरिक्त दस्तावेज़ मिल गया ✅", this.question(cur.step, data)];
    }

    const deed = await this.extractor.extract(file.buf, file.mime).catch((e) => {
      this.log.error(`deed extract failed: ${e?.message}`);
      return null;
    });

    await this.prisma.draftIntake.create({
      data: {
        organizationId: this.orgId,
        phone: ctx.phone,
        customerName: ctx.name,
        step: "CONFIRM_PROPERTY",
        data: {},
        deed: (deed ?? undefined) as any,
        documentKey: file.key,
        needsStaff: !deed?.isSaleDeed,
      },
    });
    return [this.deedSummary(deed)];
  }

  // ================= text received =================
  /** Returns null when no draft conversation is active (caller sends the default reply). */
  async handleText(ctx: Ctx, raw: string): Promise<string[] | null> {
    const v = normDigits(raw.trim());
    const cur = await this.active(ctx.phone);

    if (!cur) {
      if (/ड्राफ्ट|draft|रजिस्ट्री|registry/i.test(v)) {
        return ["ड्राफ्ट के लिए कृपया पुरानी रजिस्ट्री की PDF या सभी पन्नों की साफ़ फ़ोटो भेजें।"];
      }
      return null;
    }
    if (CANCEL.test(v)) {
      await this.save(cur.id, { status: "CANCELLED" });
      return ["आपका ड्राफ्ट अनुरोध रद्द कर दिया गया है।"];
    }

    const data: any = { ...(cur.data as any) };
    switch (cur.step) {
      case "CONFIRM_PROPERTY":
        if (YES.test(v)) return this.goto(cur.id, data, BUYER_STEPS[0]!.key);
        if (NO.test(v)) {
          await this.save(cur.id, { status: "CANCELLED", needsStaff: true });
          return ["ठीक है। हमारा स्टाफ आपसे जल्द संपर्क करेगा।"];
        }
        return ["कृपया \"हाँ\" या \"नहीं\" लिखें।"];

      case "AMOUNT":
        return this.handleAmount(cur, data, v);

      case "FINAL":
        if (YES.test(v)) return this.submit(cur);
        if (/बदल|change|edit/i.test(v)) return this.goto(cur.id, {}, BUYER_STEPS[0]!.key, "ठीक है, विवरण दोबारा लेते हैं।");
        return ["पुष्टि के लिए \"हाँ\", दोबारा भरने के लिए \"बदलें\", या बंद करने के लिए \"रद्द\" लिखें।"];

      default: {
        const step = ALL_STEPS.find((s) => s.key === cur.step);
        if (!step) return null;
        const optional = step.optional || (step === PAN_STEP && !data.tax?.panRequired);
        const val = optional && SKIP.test(v) ? "" : step.validate(v);
        if (val === null) return [step.err ?? "कृपया सही जानकारी भेजें।"];
        data[step.key] = step.secret && val ? encrypt(val) : val;
        return this.goto(cur.id, data, this.nextStep(step.key, data));
      }
    }
  }

  /** Buyer steps → AMOUNT → buyer PAN → seller PAN (only if TDS) → FINAL. */
  private nextStep(after: string, data: any): string {
    const i = BUYER_STEPS.findIndex((s) => s.key === after);
    if (i >= 0) return BUYER_STEPS[i + 1]?.key ?? "AMOUNT";
    if (after === "AMOUNT") return PAN_STEP.key;
    if (after === PAN_STEP.key) return data.tax?.tdsApplies ? SELLER_PAN_STEP.key : "FINAL";
    return "FINAL";
  }

  // ================= amount / guideline =================
  private async handleAmount(cur: any, data: any, v: string): Promise<string[]> {
    const deed = cur.deed as DeedExtract | null;
    const g: GuidelineResult | null = deed?.property
      ? await this.guideline.lookup(deed.property, { owners: deed.buyers?.length }).catch(() => null)
      : null;
    const out: string[] = [];
    let needsStaff = cur.needsStaff as boolean;

    if (/गाइडलाइन|guideline|गाइड/i.test(v)) {
      data.amountMode = "GUIDELINE";
      if (g) {
        data.amount = g.marketValue;
        data.guideline = g;
        out.push(this.guidelineMsg(g));
      } else {
        data.amount = null;
        needsStaff = true;
        out.push("इस संपत्ति की गाइडलाइन अपने-आप नहीं मिल पाई। स्टाफ जाँचकर बताएगा।");
      }
    } else {
      const n = parseAmount(v);
      if (!n) return ["राशि समझ नहीं आई। जैसे 1500000 या 15 लाख लिखें, या \"गाइडलाइन\" लिखें।"];
      data.amountMode = "CUSTOM";
      data.amount = n;
      if (g && n < g.marketValue) {
        data.guideline = g;
        out.push(
          `ध्यान दें: यह राशि गाइडलाइन मूल्य (₹${inr(g.marketValue)}) से कम है। ` +
            "स्टाम्प शुल्क गाइडलाइन मूल्य के हिसाब से लग सकता है — स्टाफ इसकी पुष्टि करेगा।",
        );
      }
    }

    // Tax rules apply on the higher of declared amount and guideline value.
    // Unknown guideline value → be safe and require PAN.
    const value = Math.max(data.amount ?? 0, g?.marketValue ?? 0);
    const agricultural = deed?.property?.propertyType === "agricultural";
    const flags = data.amount == null && !g ? { panRequired: true, sftReported: false, tdsApplies: false } : taxFlags(value, agricultural);
    data.tax = flags;
    out.push(taxNotice(flags));

    const next = this.nextStep("AMOUNT", data);
    await this.save(cur.id, { data, step: next, needsStaff });
    out.push(this.question(next, data));
    return out;
  }

  private guidelineMsg(g: GuidelineResult): string {
    const lines = [
      `📍 गाइडलाइन (${g.year}) — ${g.matchedLocality}`,
      ...g.lines,
      `*गाइडलाइन मूल्य: ₹${inr(g.marketValue)}*`,
      "",
      `स्टाम्प शुल्क (${(g.stamp.sdPct * 100).toFixed(1)}%): ₹${inr(g.stamp.male.stampDuty)}`,
      `पंजीयन शुल्क: पुरुष क्रेता ₹${inr(g.stamp.male.registration)} (3%) | महिला क्रेता ₹${inr(g.stamp.female.registration)} (1%)`,
      `कुल अनुमानित खर्च: पुरुष ₹${inr(g.stamp.male.total)} | महिला ₹${inr(g.stamp.female.total)}`,
      "",
      ...g.assumptions.map((a) => `ℹ️ ${a}`),
      "यह अनुमानित है, अंतिम गणना संपदा पोर्टल पर होगी।",
    ];
    return lines.join("\n");
  }

  // ================= summary / submit =================
  private finalSummary(d: any): string {
    const lines = ["कृपया विवरण जाँचें:"];
    for (const s of ALL_STEPS) {
      if (d[s.key] === undefined) continue;
      const shown = d[s.key] ? (s.secret ? mask(decrypt(d[s.key])) : d[s.key]) : "—";
      lines.push(`${s.label}: ${shown}`);
    }
    const amt =
      d.amount != null
        ? `₹${inr(d.amount)}${d.amountMode === "GUIDELINE" ? " (गाइडलाइन)" : ""}`
        : "गाइडलाइन (स्टाफ बताएगा)";
    lines.push(`राशि: ${amt}`, "", "सही है तो \"हाँ\" लिखें। दोबारा भरने के लिए \"बदलें\" लिखें।");
    return lines.join("\n");
  }

  private async submit(cur: any): Promise<string[]> {
    await this.save(cur.id, { status: "SUBMITTED", workStatus: "NEW" });
    // workStatus NEW puts it on the office's "WhatsApp अनुरोध" page.
    // TODO: notify staff (e.g. push/email) when a new request arrives.
    const ref = String(cur.id).slice(-6).toUpperCase();
    return [`✅ आपका ड्राफ्ट अनुरोध दर्ज हो गया।\nअनुरोध नंबर: ${ref}\nस्टाफ ड्राफ्ट तैयार करके आपसे संपर्क करेगा।`];
  }

  private deedSummary(deed: DeedExtract | null): string {
    const tail =
      "\n\nक्या इसी संपत्ति का नया रजिस्ट्री ड्राफ्ट बनवाना है? \"हाँ\" या \"नहीं\" लिखें।" +
      "\n(आपकी जानकारी सिर्फ़ ड्राफ्ट बनाने में उपयोग होगी। कभी भी \"रद्द\" लिखकर बंद कर सकते हैं।)";
    if (!deed?.isSaleDeed || !deed.property) return "दस्तावेज़ मिल गया ✅ इसका विवरण स्टाफ जाँचेगा।" + tail;
    const p = deed.property;
    const place = [p.locality, p.village, p.tehsil, p.district].filter(Boolean).join(", ");
    const lines = ["रजिस्ट्री मिल गई ✅"];
    if (place) lines.push(`संपत्ति: ${place}`);
    if (p.khasraOrPlotNo) lines.push(`खसरा/प्लॉट: ${p.khasraOrPlotNo}`);
    if (p.areaValue) lines.push(`क्षेत्रफल: ${p.areaValue} ${p.areaUnit ?? ""}`.trim());
    if (deed.buyers?.length) lines.push(`वर्तमान मालिक (विक्रेता): ${deed.buyers.map((b) => b.name).join(", ")}`);
    if (deed.registrationNo)
      lines.push(`पिछली रजिस्ट्री: ${deed.registrationNo}${deed.registrationDate ? ", " + deed.registrationDate : ""}`);
    return lines.join("\n") + tail;
  }

  // ================= db / helpers =================
  private active(phone: string) {
    return this.prisma.draftIntake.findFirst({
      where: {
        organizationId: this.orgId,
        phone,
        status: "ACTIVE",
        updatedAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  private save(id: string, data: any) {
    return this.prisma.draftIntake.update({ where: { id }, data });
  }

  private async goto(id: string, data: any, step: string, prefix?: string): Promise<string[]> {
    await this.save(id, { data, step });
    return [...(prefix ? [prefix] : []), this.question(step, data)];
  }

  private question(step: string, data: any): string {
    if (step === "AMOUNT") return AMOUNT_ASK;
    if (step === "CONFIRM_PROPERTY") return "कृपया \"हाँ\" या \"नहीं\" लिखें।";
    if (step === "FINAL") return this.finalSummary(data);
    if (step === PAN_STEP.key && !data.tax?.panRequired) return PAN_STEP.ask + " PAN न हो तो \"नहीं\" लिखें।";
    return ALL_STEPS.find((s) => s.key === step)?.ask ?? "";
  }
}
