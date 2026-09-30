import { Injectable, Logger } from "@nestjs/common";
import {
  formatParty,
  ID_PHOTO_LABEL,
  type IdPhotoKind,
  parseRelation,
  type PartyField,
  plotAreaShort,
  type Relation,
  SAMPADA_REQUIRED_PARTY_FIELDS,
  SAMPADA_REQUIRED_PARTY_PHOTOS,
  splitNameRelation,
  stripHonorific,
} from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { type DeedExtract, DeedExtractorService } from "./deed-extractor.service.js";
import { type GuidelineResult, GuidelineLookupService } from "./guideline-lookup.service.js";
import { IdCardExtractorService } from "./id-card-extractor.service.js";
import { idWarningsFor, mapIdRead } from "./id-cards.js";
import { decrypt, encrypt, mask } from "./pii-crypto.js";
import {
  detectDeedIntent,
  inr,
  MORTGAGE_PEOPLE,
  normDigits,
  parseAmount,
  parseDeedChoice,
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
const UNKNOWN = /^(पता नहीं|पता नही|नहीं पता|नही पता|pata nahi|pata nahin|nahi pata|nahin pata|don'?t know|unknown|3)$/i;

/** हाँ → true, नहीं → false, पता नहीं → null, anything else → undefined (ask again). */
function yesNoUnknown(v: string): boolean | null | undefined {
  if (UNKNOWN.test(v)) return null;
  if (YES.test(v)) return true;
  if (NO.test(v)) return false;
  return undefined;
}

// ---------- plot questions (asked right after the property is confirmed, only for plots) ----------
// Why: the office guideline calculator adds +10% for a corner plot (rule 2.2); a plot with a
// house/construction is valued as a building (needs floor details → staff). A boundary wall has
// no rule in the calculator -- it is recorded for staff only.
const PLOT_STEPS = [
  {
    key: "PLOT_BUILDING",
    field: "plotHasBuilding",
    label: "प्लॉट पर मकान/निर्माण",
    ask: "क्या इस प्लॉट पर मकान या कोई निर्माण बना हुआ है? \"हाँ\", \"नहीं\" या \"पता नहीं\" लिखें।",
  },
  {
    key: "PLOT_CORNER",
    field: "plotCorner",
    label: "कॉर्नर प्लॉट",
    ask: "क्या यह कॉर्नर प्लॉट है (दो सड़कों के कोने पर)? \"हाँ\", \"नहीं\" या \"पता नहीं\" लिखें।",
  },
  {
    key: "PLOT_BOUNDARY",
    field: "plotBoundary",
    label: "बाउंड्री वॉल",
    ask: "क्या प्लॉट पर बाउंड्री वॉल बनी हुई है? \"हाँ\", \"नहीं\" या \"पता नहीं\" लिखें।",
  },
] as const;
const PLOT_FIELDS = PLOT_STEPS.map((s) => s.field);
/** ID-photo bookkeeping kept when the customer re-enters their details ("बदलें"). */
const ID_KEEP = ["idPhotos", "idFiles", "idTries", "idDone", "idNoticeShown", "idRead"];

/** Plot deeds (residential or commercial plot) get the plot questions. */
export function isPlotDeed(deed: DeedExtract | null | undefined): boolean {
  const t = deed?.property?.propertyType;
  return t === "residential_plot" || t === "commercial";
}
const yesNoLabel = (v: unknown) => (v === true ? "हाँ" : v === false ? "नहीं" : "पता नहीं");

// ---------- SAMPADA-required fields ----------
// SAMPADA 2.0 needs name, father/husband, mother, Aadhaar, mobile, email and
// address to create each party's ID (SAMPADA_REQUIRED_PARTY_FIELDS in
// @sampada/shared), so none of those questions can be skipped. Email is never
// printed in the deed text.
/** "नहीं", "ईमेल नहीं है", "no email", "nahi hai" ... -- a negation and no "@". */
const saysNoEmail = (v: string) => !v.includes("@") && /(नहीं|नही|nahi|nahin|nhi|\bno\b|none|not)/i.test(v);
const NO_EMAIL_REPLY =
  "SAMPADA 2.0 पर पक्षकार की ID बनाने के लिए ईमेल ID ज़रूरी है। " +
  "अपनी ईमेल न हो तो परिवार के किसी सदस्य की ईमेल ID भी चलेगी। कृपया ईमेल ID लिखें।\n" +
  "(हमारा स्टाफ भी इस बारे में आपसे संपर्क कर सकता है।)";

/** Question key for each SAMPADA-required field of a person ("buyer", "mortgagor", ...). */
const FIELD_STEP: Record<PartyField, string> = {
  name: "Name",
  guardian: "FatherName",
  motherName: "MotherName",
  aadhaar: "Aadhaar",
  mobile: "Mobile",
  email: "Email",
  address: "Address",
};
/** The first unanswered SAMPADA-required question for the parties of this deed, or null. */
function firstMissingSampadaStep(d: any): string | null {
  for (const p of partyPrefixes(d)) {
    for (const f of SAMPADA_REQUIRED_PARTY_FIELDS) {
      const key = `${p}${FIELD_STEP[f]}`;
      if (!String(d[key] ?? "").trim()) return key;
    }
  }
  return null;
}

/** The people whose details the bot collects for this deed. */
export function partyPrefixes(d: any): string[] {
  return d.deedType === "mortgage" ? MORTGAGE_PEOPLE.map((m) => m.prefix) : d.deedType === "other" ? [] : ["buyer"];
}

// ---------- ID-card photos (before each person's typed questions) ----------
// Each person first sends Aadhaar front/back, PAN and a passport photo
// (SAMPADA_REQUIRED_PARTY_PHOTOS). Aadhaar and PAN are read by the vision
// reader and shown back masked; "हाँ" fills the fields, "बदलें" leaves them
// to be typed. An unreadable photo is asked again once; after two failures the
// details are typed and the request gets "स्टाफ जाँच". The photos are stored
// (R2) only for this request and deleted after it is closed (IdPhotoRetentionService).
const ID_NOTICE =
  "टाइपिंग की गलती न हो, इसलिए पहचान पत्रों की फ़ोटो से जानकारी पढ़ी जाएगी।\n" +
  "🔒 आपके दस्तावेज़ सिर्फ़ रजिस्ट्री के काम के लिए रखे जाएंगे और काम पूरा होने के बाद हटा दिए जाएंगे।";
const ID_LATER_HINT = '(फ़ोटो अभी न हो तो "बाद में" लिखें।)';
const partyWho = (prefix: string) =>
  prefix === "buyer" ? "खरीदार" : (MORTGAGE_PEOPLE.find((m) => m.prefix === prefix)?.heading ?? "पक्षकार");
const ID_ASK: Record<IdPhotoKind, (who: string) => string> = {
  aadhaarFront: (who) => `${who} के आधार कार्ड के आगे वाले हिस्से (फ़ोटो, नाम और आधार नंबर वाला) की साफ़ फ़ोटो भेजें।`,
  aadhaarBack: (who) => `अब ${who} के आधार कार्ड के पीछे वाले हिस्से (पते वाला) की साफ़ फ़ोटो भेजें।`,
  pan: (who) => `${who} के PAN कार्ड की साफ़ फ़ोटो भेजें।`,
  passportPhoto: (who) => `${who} की एक पासपोर्ट साइज़ फ़ोटो भेजें (सामने से, चेहरा साफ़ दिखे)। SAMPADA 2.0 पर पक्षकार की फ़ोटो लगती है।`,
};
const ID_RETRY = "फ़ोटो साफ़ नहीं पढ़ी जा सकी। कृपया अच्छी रोशनी में, पूरा कार्ड दिखाते हुए, बिना चमक के साफ़ फ़ोटो दोबारा भेजें।";
const ID_GAVE_UP = "फ़ोटो फिर भी नहीं पढ़ी जा सकी। कोई बात नहीं — यह जानकारी आगे लिखकर भेज दें, हमारा स्टाफ फ़ोटो से मिलान कर लेगा।";
const AADHAAR_KINDS: IdPhotoKind[] = ["aadhaarFront", "aadhaarBack"];
const idStepRe = /^ID_PHOTO:(buyer|mortgagor|witness1|witness2):(aadhaarFront|aadhaarBack|pan|passportPhoto)$/;
const idOkRe = /^ID_OK:(buyer|mortgagor|witness1|witness2):(aadhaar|pan)$/;
const personNameRe = /^(buyer|mortgagor|witness1|witness2)Name$/;
const aadhaarSpaced = (masked: string) => masked.replace(/^X{4}(\d{4})$/, "XXXX XXXX $1");

/** Next ID step for this person, or null when their photos are done. */
export function idNext(prefix: string, d: any): string | null {
  const photos = d.idPhotos?.[prefix] ?? {};
  const pend = d.idPending?.[prefix] ?? {};
  const kinds = SAMPADA_REQUIRED_PARTY_PHOTOS;
  const lastAadhaar = [...kinds].reverse().find((k) => AADHAAR_KINDS.includes(k));
  for (const k of kinds) {
    if (photos[k] === undefined) return `ID_PHOTO:${prefix}:${k}`;
    if (k === lastAadhaar && pend.aadhaar && pend.aadhaarOk === undefined) return `ID_OK:${prefix}:aadhaar`;
    if (k === "pan" && pend.pan && pend.panOk === undefined) return `ID_OK:${prefix}:pan`;
  }
  return null;
}

// ---------- how a person is written in the deed (docs/nsk-deed-drafting-pattern.md) ----------
// "श्री [नाम] पुत्र श्री [पिता]" / "श्रीमती [नाम] पत्नी श्री [पति]": the relation decides
// both the word and the honorific, so it is asked right after the name.
function relationAsk(who: string): string {
  return `${who} का संबंध चुनें — नंबर लिखें:\n1. पुत्र (पिता का नाम आगे पूछा जाएगा)\n2. पुत्री (पिता का नाम)\n3. पत्नी (पति का नाम)`;
}
/** Person name steps ("buyerName", "mortgagorName", ...) -- not FatherName/MotherName. */
const personPrefix = (key: string): string | null =>
  /(Father|Mother)Name$/.test(key) ? null : (key.match(/^(buyer|mortgagor|witness1|witness2)Name$/)?.[1] ?? null);
/** The person's line in office form, Aadhaar masked -- shown to the customer to check. */
function officeLine(d: any, prefix: string): string | null {
  if (!d[`${prefix}Name`]) return null;
  const aad = d[`${prefix}Aadhaar`];
  let masked: string | null = null;
  try {
    masked = aad ? mask(decrypt(aad)) : null;
  } catch {
    masked = null;
  }
  return formatParty({ name: d[`${prefix}Name`], relation: (d[`${prefix}Relation`] as Relation) ?? null, guardian: d[`${prefix}FatherName`] ?? null, aadhaar: masked });
}

// ---------- questions asked before the amount (order = conversation order) ----------
const BUYER_STEPS: Step[] = [
  { key: "buyerName", label: "खरीदार", ask: "खरीदार (क्रेता) का पूरा नाम लिखें। सिर्फ़ नाम लिखें — पिता/पति का नाम आगे पूछा जाएगा।", validate: validText(), err: "कृपया पूरा नाम लिखें।" },
  { key: "buyerRelation", label: "संबंध", ask: relationAsk("खरीदार"), validate: parseRelation, err: "कृपया 1, 2 या 3 लिखें।" },
  { key: "buyerFatherName", label: "पिता/पति का नाम", ask: "खरीदार के पिता या पति का नाम लिखें।", validate: validText() },
  { key: "buyerMotherName", label: "माता का नाम", ask: "खरीदार की माता का नाम लिखें।", validate: validText() },
  { key: "buyerAadhaar", label: "आधार", ask: "खरीदार का 12 अंकों का आधार नंबर लिखें।", validate: validAadhaar, secret: true, err: "आधार नंबर सही नहीं लग रहा। कृपया जाँचकर दोबारा लिखें।" },
  { key: "buyerMobile", label: "मोबाइल", ask: "खरीदार का 10 अंकों का मोबाइल नंबर लिखें।", validate: validMobile, err: "मोबाइल नंबर सही नहीं है। 10 अंकों का नंबर लिखें।" },
  { key: "buyerEmail", label: "ईमेल", ask: "खरीदार की ईमेल ID लिखें (SAMPADA 2.0 पर पक्षकार की ID के लिए ज़रूरी)।", validate: validEmail, err: "ईमेल सही नहीं है। कृपया सही ईमेल ID लिखें (जैसे naam@gmail.com)।" },
  { key: "buyerAddress", label: "पता", ask: "खरीदार का पूरा पता लिखें।", validate: validText(8), err: "कृपया पूरा पता लिखें।" },
];
const PAN_STEP: Step = { key: "buyerPan", label: "खरीदार PAN", ask: "खरीदार का PAN नंबर लिखें।", validate: validPan, secret: true, err: "PAN सही नहीं है (जैसे ABCDE1234F)।" };
const SELLER_PAN_STEP: Step = { key: "sellerPan", label: "विक्रेता PAN", ask: "TDS के लिए विक्रेता का PAN नंबर लिखें।", validate: validPan, secret: true, err: "PAN सही नहीं है (जैसे ABCDE1234F)।" };
const ALL_STEPS = [...BUYER_STEPS, PAN_STEP, SELLER_PAN_STEP];

// ---------- बंधक पत्र (mortgage deed): the mortgagor + two witnesses ----------
/** Same details for every person on a mortgage deed; `who` is used in the questions. */
function personSteps(prefix: string, who: string, heading: string): Step[] {
  return [
    { key: `${prefix}Name`, label: `${heading} — नाम`, ask: `${who} का पूरा नाम लिखें। सिर्फ़ नाम लिखें — पिता/पति का नाम आगे पूछा जाएगा।`, validate: validText(), err: "कृपया पूरा नाम लिखें।" },
    { key: `${prefix}Relation`, label: `${heading} — संबंध`, ask: relationAsk(who), validate: parseRelation, err: "कृपया 1, 2 या 3 लिखें।" },
    { key: `${prefix}FatherName`, label: `${heading} — पिता/पति का नाम`, ask: `${who} के पिता या पति का नाम लिखें।`, validate: validText() },
    { key: `${prefix}MotherName`, label: `${heading} — माता का नाम`, ask: `${who} की माता का नाम लिखें।`, validate: validText() },
    { key: `${prefix}Aadhaar`, label: `${heading} — आधार`, ask: `${who} का 12 अंकों का आधार नंबर लिखें।`, validate: validAadhaar, secret: true, err: "आधार नंबर सही नहीं लग रहा। कृपया जाँचकर दोबारा लिखें।" },
    { key: `${prefix}Mobile`, label: `${heading} — मोबाइल`, ask: `${who} का 10 अंकों का मोबाइल नंबर लिखें।`, validate: validMobile, err: "मोबाइल नंबर सही नहीं है। 10 अंकों का नंबर लिखें।" },
    { key: `${prefix}Email`, label: `${heading} — ईमेल`, ask: `${who} की ईमेल ID लिखें (SAMPADA 2.0 पर पक्षकार की ID के लिए ज़रूरी)।`, validate: validEmail, err: "ईमेल सही नहीं है। कृपया सही ईमेल ID लिखें (जैसे naam@gmail.com)।" },
    { key: `${prefix}Address`, label: `${heading} — पता`, ask: `${who} का पूरा पता लिखें।`, validate: validText(8), err: "कृपया पूरा पता लिखें।" },
  ];
}
const MORTGAGE_STEPS: Step[] = MORTGAGE_PEOPLE.flatMap((m) => personSteps(m.prefix, m.who, m.heading));
/** Every free-text question, whichever deed it belongs to. */
const ANY_STEPS = [...ALL_STEPS, ...MORTGAGE_STEPS];

const CHOOSE_DEED_ASK =
  "आपको कौन सा दस्तावेज़ बनवाना है? नंबर या नाम लिखें:\n" +
  "1. विक्रय पत्र (रजिस्ट्री — संपत्ति बेचना/खरीदना)\n" +
  "2. बंधक पत्र (बैंक लोन के लिए संपत्ति बंधक रखना)\n" +
  "3. कोई और दस्तावेज़ (दान पत्र, वसीयत, मुख्तारनामा आदि)\n" +
  '(बंद करने के लिए "रद्द" लिखें।)';
const OTHER_ASK = "कौन सा दस्तावेज़ बनवाना है? संक्षेप में लिखें (जैसे दान पत्र, वसीयत, मुख्तारनामा)।";

// ---------- बंधक पत्र: documents first ----------
// Staff read the bank, branch and loan amount from the sanction letter, so the bot
// only collects the papers: sanction letter + registry of the mortgaged property,
// and -- when the registry's owner is no longer the owner (death, will, mutation,
// partition, gift ...) -- the legal document by which the present owner got it,
// without which they cannot mortgage (equitable mortgage) the property.
const SANCTION_RE = /sanction|सैंक्शन|सेंक्शन|स्वीकृति पत्र|ऋण|loan|लोन/i;
const LATER = /^(बाद में|बाद मे|बादमें|later|baad me|baad mein|abhi nahi|अभी नहीं)$/i;
type MortgageDoc = "sanction" | "registry" | "transfer";
const MORTGAGE_DOC_LABEL: Record<MortgageDoc, string> = {
  sanction: "बैंक का सैंक्शन लेटर",
  registry: "संपत्ति की रजिस्ट्री",
  transfer: "वसीयत/नामांतरण/उत्तराधिकार का दस्तावेज़",
};
/** "✅ … मिल गया/गई" -- रजिस्ट्री is feminine. */
const MORTGAGE_DOC_RECEIVED: Record<MortgageDoc, string> = {
  sanction: "✅ बैंक का सैंक्शन लेटर मिल गया।",
  registry: "✅ संपत्ति की रजिस्ट्री मिल गई।",
  transfer: "✅ वसीयत/नामांतरण/उत्तराधिकार का दस्तावेज़ मिल गया।",
};
const DOC_STEP: Record<string, MortgageDoc> = { M_SANCTION: "sanction", M_REGISTRY: "registry", M_TRANSFER: "transfer" };
const M_FIRST_DOC_ASK =
  "आपने जो दस्तावेज़ भेजा है वह क्या है? नंबर लिखें:\n1. बैंक का सैंक्शन लेटर\n2. संपत्ति की रजिस्ट्री\n3. कुछ और";
const M_SANCTION_ASK = 'कृपया बैंक का सैंक्शन लेटर (PDF या सभी पन्नों की साफ़ फ़ोटो) भेजें। अभी न हो तो "बाद में" लिखें।';
const M_REGISTRY_ASK =
  'कृपया जिस संपत्ति को बंधक रखना है उसकी रजिस्ट्री (PDF या सभी पन्नों की साफ़ फ़ोटो) भेजें। अभी न हो तो "बाद में" लिखें।';
const M_TRANSFER_ASK =
  "संपत्ति वर्तमान मालिक के नाम कैसे आई, उसका कानूनी दस्तावेज़ भेजें — जैसे वसीयत, नामांतरण (mutation) आदेश, " +
  "उत्तराधिकार प्रमाण पत्र, बँटवारा या दान पत्र। इसी के आधार पर वर्तमान मालिक संपत्ति बंधक (equitable mortgage) रख सकते हैं।\n" +
  'अभी न हो तो "बाद में" लिखें।';
function ownerAsk(data: any): string {
  const owners: string[] = Array.isArray(data.registryOwners) ? data.registryOwners : [];
  return (
    (owners.length ? `रजिस्ट्री के अनुसार संपत्ति के मालिक: ${owners.join(", ")}\n` : "") +
    'क्या रजिस्ट्री में लिखे मालिक ही अभी संपत्ति के मालिक हैं और वही बंधक रख रहे हैं? "हाँ" या "नहीं" लिखें।\n' +
    '(अगर रजिस्ट्री वाले मालिक की मृत्यु हो चुकी है, या संपत्ति वसीयत, नामांतरण, बँटवारे आदि से किसी और के नाम आई है, तो "नहीं" लिखें।)'
  );
}
/** Next step of a बंधक पत्र: missing papers → owner check → transfer paper → people → FINAL. */
function mortgageNext(data: any): string {
  const docs = data.docs ?? {};
  if (!docs.sanction) return "M_SANCTION";
  if (!docs.registry) return "M_REGISTRY";
  if (!("ownerIsCurrent" in data)) return "M_OWNER";
  if (data.ownerIsCurrent === false && !docs.transfer) return "M_TRANSFER";
  return MORTGAGE_STEPS.find((s) => data[s.key] === undefined)?.key ?? "FINAL";
}
const ownerNames = (deed: DeedExtract | null | undefined) =>
  (deed?.buyers ?? []).map((b) => b?.name).filter((n): n is string => !!n);
const DEED_LABEL: Record<string, string> = { sale: "विक्रय पत्र", mortgage: "बंधक पत्र", other: "अन्य दस्तावेज़" };
const AMOUNT_ASK = "रजिस्ट्री कितनी राशि पर बनानी है? राशि लिखें (जैसे 1500000 या 15 लाख), या \"गाइडलाइन\" लिखें।";

@Injectable()
export class DraftIntakeService {
  private readonly log = new Logger(DraftIntakeService.name);
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: DeedExtractorService,
    private readonly guideline: GuidelineLookupService,
    private readonly idReader: IdCardExtractorService,
  ) {}

  // ================= document received =================
  async handleDocument(ctx: Ctx, file: IncomingFile): Promise<string[]> {
    const cur = await this.active(ctx.phone);
    if (cur) {
      const data: any = { ...(cur.data as any) };
      if (idStepRe.test(cur.step)) return this.receiveIdPhoto(cur, data, file);
      if (idOkRe.test(cur.step)) {
        // Probably a card photo again: keep it with the ID files (deleted on retention), not the documents.
        data.idFiles = [...(data.idFiles ?? []), file.key];
        await this.save(cur.id, { data });
        return ['कृपया पहले ऊपर पढ़ी गई जानकारी के लिए "हाँ" या "बदलें" लिखें।\n\n' + this.question(cur.step, data)];
      }
      data.extraDocs = [...(data.extraDocs ?? []), file.key];
      if (data.deedType === "mortgage" && cur.step in DOC_STEP) return this.receiveMortgageDoc(cur, data, file);
      await this.save(cur.id, { data });
      return ["अतिरिक्त दस्तावेज़ मिल गया ✅", this.question(cur.step, data)];
    }

    const deed = await this.extractor.extract(file.buf, file.mime).catch((e) => {
      this.log.error(`deed extract failed: ${e?.message}`);
      return null;
    });

    // A sale deed → "draft for this property?"; anything else (a bank sanction
    // letter, an unreadable scan, ...) → ask which document they want made.
    const isSale = !!deed?.isSaleDeed && !!deed.property;
    await this.prisma.draftIntake.create({
      data: {
        organizationId: this.orgId,
        phone: ctx.phone,
        customerName: ctx.name,
        step: isSale ? "CONFIRM_PROPERTY" : "CHOOSE_DEED",
        data: {},
        deed: (deed ?? undefined) as any,
        documentKey: file.key,
        needsStaff: !deed,
      },
    });
    return [isSale ? this.deedSummary(deed) : "दस्तावेज़ मिल गया ✅\n\n" + CHOOSE_DEED_ASK];
  }

  // ================= text received =================
  /** Returns null when no draft conversation is active (caller sends the default reply). */
  async handleText(ctx: Ctx, raw: string): Promise<string[] | null> {
    const v = normDigits(raw.trim());
    const cur = await this.active(ctx.phone);

    if (!cur) {
      if (detectDeedIntent(v) === "mortgage") {
        return ["बंधक पत्र के लिए कृपया बैंक का सैंक्शन लेटर और जिस संपत्ति को बंधक रखना है उसकी रजिस्ट्री की PDF या साफ़ फ़ोटो भेजें।"];
      }
      if (/ड्राफ्ट|draft|रजिस्ट्री|registry/i.test(v) || detectDeedIntent(v)) {
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
      case "CONFIRM_PROPERTY": {
        // Answer what the customer actually said: "बंधक बनाना है" is not a yes/no.
        const intent = YES.test(v) ? "sale" : NO.test(v) ? null : detectDeedIntent(v);
        if (intent) return this.startDeed(cur, data, intent, raw);
        if (NO.test(v)) return this.goto(cur.id, data, "CHOOSE_DEED", "ठीक है।");
        return ['कृपया "हाँ" या "नहीं" लिखें, या बताएँ कौन सा दस्तावेज़ बनवाना है (जैसे बंधक पत्र)।'];
      }

      case "CHOOSE_DEED": {
        const intent = parseDeedChoice(v);
        if (!intent) return ["कृपया 1, 2 या 3 लिखें।\n\n" + CHOOSE_DEED_ASK];
        // "3" alone doesn't say which document -- ask; words like "दान पत्र" already do.
        if (intent === "other" && /^3\b/.test(v)) return this.goto(cur.id, data, "OTHER_DESC");
        return this.startDeed(cur, data, intent, raw);
      }

      case "OTHER_DESC":
        return this.startDeed(cur, data, "other", raw);

      case "PLOT_BUILDING":
      case "PLOT_CORNER":
      case "PLOT_BOUNDARY": {
        const i = PLOT_STEPS.findIndex((s) => s.key === cur.step);
        const step = PLOT_STEPS[i]!;
        const answer = yesNoUnknown(v);
        if (answer === undefined) return ["कृपया \"हाँ\", \"नहीं\" या \"पता नहीं\" लिखें।"];
        data[step.field] = answer;
        const next = PLOT_STEPS[i + 1]?.key ?? BUYER_STEPS[0]!.key;
        if (step.key === "PLOT_BUILDING" && answer !== false) {
          // A house (or not knowing) means the value needs construction details.
          await this.save(cur.id, { needsStaff: true });
          return this.goto(cur.id, data, next, "ठीक है। मकान/निर्माण वाली संपत्ति का मूल्य स्टाफ निर्माण का विवरण लेकर तय करेगा।");
        }
        return this.goto(cur.id, data, next);
      }

      case "M_FIRST_DOC": {
        const n = normDigits(v).trim();
        const role: MortgageDoc | null | undefined = /^1\b/.test(n) ? "sanction" : /^2\b/.test(n) ? "registry" : /^3\b/.test(n) ? null : undefined;
        if (role === undefined) return ["कृपया 1, 2 या 3 लिखें।\n\n" + M_FIRST_DOC_ASK];
        data.docs = { ...(data.docs ?? {}) };
        if (role) data.docs[role] = cur.documentKey;
        // Not recognised as a sale deed by the reader: staff should look at it.
        if (role === "registry") await this.save(cur.id, { needsStaff: true });
        return this.goto(cur.id, data, mortgageNext(data));
      }

      case "M_SANCTION":
      case "M_REGISTRY":
      case "M_TRANSFER": {
        const role = DOC_STEP[cur.step]!;
        if (!LATER.test(v)) return [this.question(cur.step, data)];
        data.docs = { ...(data.docs ?? {}), [role]: "later" };
        await this.save(cur.id, { data, needsStaff: true });
        const next = mortgageNext(data);
        return this.goto(cur.id, data, next, `ठीक है, ${MORTGAGE_DOC_LABEL[role]} बाद में भेज दें।`);
      }

      case "M_OWNER": {
        const answer = yesNoUnknown(v);
        if (answer === undefined) return ['कृपया "हाँ", "नहीं" या "पता नहीं" लिखें।'];
        data.ownerIsCurrent = answer;
        if (answer === null) await this.save(cur.id, { needsStaff: true });
        const next = mortgageNext(data);
        return this.goto(cur.id, data, next, next === MORTGAGE_STEPS[0]!.key ? "अब बंधककर्ता और दो गवाहों की जानकारी लेते हैं।" : undefined);
      }

      case "AMOUNT":
        return this.handleAmount(cur, data, v);

      case "FINAL":
        if (YES.test(v)) {
          // Nothing SAMPADA needs may be missing (e.g. an email skipped before it was required).
          const missing = firstMissingSampadaStep(data);
          if (missing) return this.goto(cur.id, data, missing, "SAMPADA 2.0 के लिए एक जानकारी बाकी है।");
          return this.submit(cur);
        }
        if (/बदल|change|edit/i.test(v)) {
          // Re-collect the people's details; the deed type and plot answers stay.
          const keep = Object.fromEntries(
            ["deedType", "docs", "ownerIsCurrent", "registryOwners", "extraDocs", ...PLOT_FIELDS, ...ID_KEEP]
              .filter((f) => f in data)
              .map((f) => [f, data[f]]),
          );
          const first = data.deedType === "mortgage" ? MORTGAGE_STEPS[0]!.key : BUYER_STEPS[0]!.key;
          return this.goto(cur.id, keep, first, "ठीक है, विवरण दोबारा लेते हैं।");
        }
        return ["पुष्टि के लिए \"हाँ\", दोबारा भरने के लिए \"बदलें\", या बंद करने के लिए \"रद्द\" लिखें।"];

      default: {
        if (idStepRe.test(cur.step)) return this.idPhotoText(cur, data, v);
        if (idOkRe.test(cur.step)) return this.idConfirm(cur, data, v);
        const step = ANY_STEPS.find((s) => s.key === cur.step);
        if (!step) return null;
        const optional = step.optional || (step === PAN_STEP && !data.tax?.panRequired);
        if (/Email$/.test(step.key) && (SKIP.test(v) || saysNoEmail(v))) {
          // Email is SAMPADA-required for every party: never skipped. Explain, flag
          // the request for staff, and keep asking.
          await this.save(cur.id, { needsStaff: true });
          return [NO_EMAIL_REPLY];
        }
        const prefix = personPrefix(step.key);
        const split = prefix ? splitNameRelation(raw) : null;
        if (prefix && split) {
          // "अमित शर्मा पुत्र श्री राजेश शर्मा" → name, relation and father in one go.
          data[step.key] = split.name;
          data[`${prefix}Relation`] = split.relation;
          data[`${prefix}FatherName`] = split.guardian;
        } else {
          const val = optional && SKIP.test(v) ? "" : step.validate(v);
          if (val === null) return [step.err ?? "कृपया सही जानकारी भेजें।"];
          const clean = prefix || /FatherName$|MotherName$/.test(step.key) ? stripHonorific(val) : val;
          data[step.key] = step.secret && clean ? encrypt(clean) : clean;
        }
        // Skip questions already answered (e.g. by the split above or an ID card).
        return this.goto(cur.id, data, this.advance(step.key, data));
      }
    }
  }

  /**
   * Starts the chosen document's questions.
   * sale → plot questions (plots only) → buyer; mortgage → mortgagor + 2 witnesses;
   * other → recorded for staff and submitted (the bot has no questions for it yet).
   */
  private async startDeed(cur: any, data: any, intent: "sale" | "mortgage" | "other", said?: string): Promise<string[]> {
    const deed = cur.deed as DeedExtract | null;
    if (intent === "sale") {
      data.deedType = "sale";
      if (!deed?.isSaleDeed) {
        // No sale deed to read the property from -- staff will need the registry.
        await this.save(cur.id, { needsStaff: true });
      }
      return this.goto(cur.id, data, isPlotDeed(deed) ? PLOT_STEPS[0].key : BUYER_STEPS[0]!.key);
    }
    if (intent === "mortgage") {
      data.deedType = "mortgage";
      data.docs = { ...(data.docs ?? {}) };
      const intro = [
        "ठीक है, बंधक पत्र बनाते हैं। इसके लिए ये दस्तावेज़ ज़रूरी हैं:",
        "1. बैंक का सैंक्शन लेटर (बैंक और लोन का विवरण स्टाफ इसी से देख लेगा)",
        "2. जिस संपत्ति को बंधक रखना है उसकी रजिस्ट्री",
      ];
      // What was the document they already sent?
      let next: string;
      if (deed?.isSaleDeed && cur.documentKey) {
        data.docs.registry = cur.documentKey;
        data.registryOwners = ownerNames(deed);
        intro.push("", MORTGAGE_DOC_RECEIVED.registry);
        next = mortgageNext(data);
      } else if (cur.documentKey && (SANCTION_RE.test(deed?.documentType ?? "") || SANCTION_RE.test(said ?? ""))) {
        data.docs.sanction = cur.documentKey;
        intro.push("", MORTGAGE_DOC_RECEIVED.sanction);
        next = mortgageNext(data);
      } else {
        next = cur.documentKey ? "M_FIRST_DOC" : mortgageNext(data);
      }
      return this.goto(cur.id, data, next, intro.join("\n"));
    }
    data.deedType = "other";
    data.requestedDeed = (said ?? "").trim().slice(0, 200) || null;
    await this.save(cur.id, { data, step: "FINAL", status: "SUBMITTED", workStatus: "NEW", needsStaff: true });
    const ref = String(cur.id).slice(-6).toUpperCase();
    return [`✅ आपका अनुरोध दर्ज हो गया।\nअनुरोध नंबर: ${ref}\nइस दस्तावेज़ के लिए हमारा स्टाफ आपसे जल्द संपर्क करेगा।`];
  }

  /**
   * A file sent while the बंधक पत्र flow is waiting for a document. It is taken
   * as the document asked for -- except that a sale deed sent when the sanction
   * letter was asked for is the registry (read by the extractor).
   */
  private async receiveMortgageDoc(cur: any, data: any, file: IncomingFile): Promise<string[]> {
    let role = DOC_STEP[cur.step]!;
    const read =
      role === "transfer"
        ? null
        : await this.extractor.extract(file.buf, file.mime).catch((e) => {
            this.log.error(`mortgage doc extract failed: ${e?.message}`);
            return null;
          });
    if (role === "sanction" && read?.isSaleDeed) role = "registry";
    data.docs = { ...(data.docs ?? {}), [role]: file.key };
    const patch: Record<string, unknown> = {};
    if (role === "registry") {
      data.registryOwners = ownerNames(read);
      // The property details on the office page come from the registry.
      if (read?.isSaleDeed) patch.deed = read;
      else patch.needsStaff = true;
    }
    const next = mortgageNext(data);
    if (Object.keys(patch).length) await this.save(cur.id, patch);
    const reply = [MORTGAGE_DOC_RECEIVED[role]];
    if (next === MORTGAGE_STEPS[0]!.key) reply.push("अब बंधककर्ता और दो गवाहों की जानकारी लेते हैं।");
    return [...reply, ...(await this.goto(cur.id, data, next))];
  }

  /** Buyer steps → AMOUNT → buyer PAN → seller PAN (only if TDS) → FINAL; mortgage: people in order → FINAL. */
  private nextStep(after: string, data: any): string {
    const m = MORTGAGE_STEPS.findIndex((s) => s.key === after);
    if (m >= 0) return MORTGAGE_STEPS[m + 1]?.key ?? "FINAL";
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
      ? await this.guideline
          .lookup(deed.property, {
            owners: deed.buyers?.length,
            plot: isPlotDeed(deed) ? { hasBuilding: data.plotHasBuilding, corner: data.plotCorner } : undefined,
          })
          .catch(() => null)
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

    const next = this.advance("AMOUNT", data);
    await this.save(cur.id, { needsStaff });
    return [...out, ...(await this.goto(cur.id, data, next))];
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
    const shownValue = (s: Step) => (d[s.key] ? (s.secret ? mask(decrypt(d[s.key])) : d[s.key]) : "—");
    if (d.deedType === "mortgage") {
      const docs = d.docs ?? {};
      const got = (k: MortgageDoc) => (docs[k] === "later" ? "बाद में भेजेंगे" : docs[k] ? "मिला ✅" : "—");
      const lines = [
        "कृपया विवरण जाँचें:",
        `दस्तावेज़: ${DEED_LABEL.mortgage}`,
        `सैंक्शन लेटर: ${got("sanction")}`,
        `रजिस्ट्री: ${got("registry")}`,
      ];
      if ("ownerIsCurrent" in d) lines.push(`रजिस्ट्री वाले मालिक ही वर्तमान मालिक: ${yesNoLabel(d.ownerIsCurrent)}`);
      if (d.ownerIsCurrent === false) lines.push(`वसीयत/नामांतरण दस्तावेज़: ${got("transfer")}`);
      for (const m of MORTGAGE_PEOPLE) {
        lines.push("", `*${m.heading}*`);
        const line = officeLine(d, m.prefix);
        if (line) lines.push(`ड्राफ्ट में: ${line}`);
        for (const s of MORTGAGE_STEPS.filter((x) => x.key.startsWith(m.prefix))) {
          if (d[s.key] !== undefined) lines.push(`${s.label.split(" — ")[1]}: ${shownValue(s)}`);
        }
      }
      lines.push("", 'सही है तो "हाँ" लिखें। दोबारा भरने के लिए "बदलें" लिखें।');
      return lines.join("\n");
    }
    const lines = ["कृपया विवरण जाँचें:"];
    for (const s of PLOT_STEPS) {
      if (d[s.field] !== undefined) lines.push(`${s.label}: ${yesNoLabel(d[s.field])}`);
    }
    for (const s of ALL_STEPS) {
      if (d[s.key] === undefined) continue;
      const shown = d[s.key] ? (s.secret ? mask(decrypt(d[s.key])) : d[s.key]) : "—";
      lines.push(`${s.label}: ${shown}`);
    }
    const buyerLine = officeLine(d, "buyer");
    if (buyerLine) lines.push("", `ड्राफ्ट में ऐसे लिखा जाएगा:\nक्रेता पक्ष - ${buyerLine}`);
    const amt =
      d.amount != null
        ? `₹${inr(d.amount)}${d.amountMode === "GUIDELINE" ? " (गाइडलाइन)" : ""}`
        : "गाइडलाइन (स्टाफ बताएगा)";
    lines.push(`राशि: ${amt}`, "", "सही है तो \"हाँ\" लिखें। दोबारा भरने के लिए \"बदलें\" लिखें।");
    return lines.join("\n");
  }

  private async submit(cur: any): Promise<string[]> {
    const d = (cur.data ?? {}) as any;
    // Aadhaar vs PAN name, PAN father vs typed father, unreadable cards → staff check.
    const idWarn = partyPrefixes(d).some(
      (p) => idWarningsFor(d.idRead?.[p], { fatherName: d[`${p}FatherName`], relation: d[`${p}Relation`] }).length > 0,
    );
    await this.save(cur.id, { status: "SUBMITTED", workStatus: "NEW", ...(idWarn ? { needsStaff: true } : {}) });
    // workStatus NEW puts it on the office's "WhatsApp अनुरोध" page.
    // TODO: notify staff (e.g. push/email) when a new request arrives.
    const ref = String(cur.id).slice(-6).toUpperCase();
    return [`✅ आपका ड्राफ्ट अनुरोध दर्ज हो गया।\nअनुरोध नंबर: ${ref}\nस्टाफ ड्राफ्ट तैयार करके आपसे संपर्क करेगा।`];
  }

  private deedSummary(deed: DeedExtract | null): string {
    const tail =
      "\n\nक्या इसी संपत्ति का नया रजिस्ट्री (विक्रय पत्र) ड्राफ्ट बनवाना है? \"हाँ\" या \"नहीं\" लिखें।" +
      "\nकोई और दस्तावेज़ बनवाना हो तो उसका नाम लिखें (जैसे बंधक पत्र)।" +
      "\n(आपकी जानकारी सिर्फ़ ड्राफ्ट बनाने में उपयोग होगी। कभी भी \"रद्द\" लिखकर बंद कर सकते हैं।)";
    if (!deed?.isSaleDeed || !deed.property) return "दस्तावेज़ मिल गया ✅ इसका विवरण स्टाफ जाँचेगा।" + tail;
    const p = deed.property;
    const place = [p.locality, p.village, p.tehsil, p.district].filter(Boolean).join(", ");
    const lines = ["रजिस्ट्री मिल गई ✅"];
    if (place) lines.push(`संपत्ति: ${place}`);
    if (p.khasraOrPlotNo) lines.push(`खसरा/प्लॉट: ${p.khasraOrPlotNo}`);
    if (p.areaValue) lines.push(`क्षेत्रफल: ${plotAreaShort(p.areaValue, p.areaUnit) ?? `${p.areaValue} ${p.areaUnit ?? ""}`.trim()}`);
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

  /** Saves and asks `step` -- or, before a person's first question, their ID photos. */
  private async goto(id: string, data: any, step: string, prefix?: string): Promise<string[]> {
    const person = step.match(personNameRe)?.[1];
    if (person && !data.idDone?.[person]) {
      const id0 = idNext(person, data);
      if (id0) step = id0;
      else data.idDone = { ...(data.idDone ?? {}), [person]: true };
    }
    const out = prefix ? [prefix] : [];
    if (step.startsWith("ID_PHOTO:") && !data.idNoticeShown) {
      data.idNoticeShown = true;
      out.push(ID_NOTICE);
    }
    await this.save(id, { data, step });
    return [...out, this.question(step, data)];
  }

  /** The question after `from`, skipping ones already answered (typed or from an ID card). */
  private advance(from: string, data: any): string {
    let next = this.nextStep(from, data);
    while (ANY_STEPS.some((x) => x.key === next) && data[next] !== undefined) next = this.nextStep(next, data);
    return next;
  }

  // ================= ID-card photos =================
  /** After the person's photos: their first unanswered typed question. */
  private afterId(prefix: string, data: any): string {
    data.idDone = { ...(data.idDone ?? {}), [prefix]: true };
    const first = `${prefix}Name`;
    return data[first] === undefined ? first : this.advance(first, data);
  }

  private nextAfterPhoto(prefix: string, data: any): string {
    return idNext(prefix, data) ?? this.afterId(prefix, data);
  }

  private async receiveIdPhoto(cur: any, data: any, file: IncomingFile): Promise<string[]> {
    const [, prefix, kind] = cur.step.match(idStepRe) as [string, string, IdPhotoKind];
    // Every ID file is listed for deletion after the request closes, even a rejected blurry one.
    data.idFiles = [...(data.idFiles ?? []), file.key];
    const setPhoto = () => {
      data.idPhotos = { ...(data.idPhotos ?? {}), [prefix]: { ...(data.idPhotos?.[prefix] ?? {}), [kind]: file.key } };
    };
    if (kind === "passportPhoto") {
      setPhoto();
      return this.goto(cur.id, data, this.nextAfterPhoto(prefix, data), `✅ ${ID_PHOTO_LABEL[kind]} मिल गई।`);
    }
    const raw = await this.idReader.read(file.buf, file.mime).catch((e) => {
      this.log.error(`ID card read failed: ${e?.name ?? "error"}`);
      return null;
    });
    const pend = { ...(data.idPending?.[prefix] ?? {}) };
    let ok = false;
    let wrongCard = false;
    if (kind === "pan") {
      const r = mapIdRead("pan", raw);
      if (r.ok) {
        ok = true;
        pend.pan = { pan: encrypt(r.value.pan), nameEn: r.value.nameEn, fatherEn: r.value.fatherEn, dob: r.value.dob };
      } else wrongCard = r.reason === "wrongCard";
    } else if (kind === "aadhaarFront") {
      const r = mapIdRead("aadhaarFront", raw);
      if (r.ok) {
        ok = true;
        const v = r.value;
        pend.aadhaar = { ...(pend.aadhaar ?? {}), aadhaar: encrypt(v.aadhaar), name: v.name, nameEn: v.nameEn, dob: v.dob, gender: v.gender, ...(v.address ? { address: v.address } : {}) };
      } else wrongCard = r.reason === "wrongCard";
    } else {
      const r = mapIdRead("aadhaarBack", raw);
      if (r.ok) {
        ok = true;
        pend.aadhaar = { ...(pend.aadhaar ?? {}), address: r.value.address };
      } else wrongCard = r.reason === "wrongCard";
    }
    const tries = (data.idTries?.[prefix]?.[kind] ?? 0) + 1;
    data.idTries = { ...(data.idTries ?? {}), [prefix]: { ...(data.idTries?.[prefix] ?? {}), [kind]: tries } };
    if (!ok && tries < 2) {
      await this.save(cur.id, { data });
      return [wrongCard ? `यह ${ID_PHOTO_LABEL[kind]} नहीं लग रहा। कृपया ${ID_PHOTO_LABEL[kind]} की साफ़ फ़ोटो भेजें।` : ID_RETRY];
    }
    setPhoto(); // the latest photo is kept for staff even when unreadable
    data.idPending = { ...(data.idPending ?? {}), [prefix]: pend };
    if (!ok) {
      data.idRead = { ...(data.idRead ?? {}), [prefix]: { ...(data.idRead?.[prefix] ?? {}), unreadable: true } };
      await this.save(cur.id, { needsStaff: true });
      return this.goto(cur.id, data, this.nextAfterPhoto(prefix, data), ID_GAVE_UP);
    }
    return this.goto(cur.id, data, this.nextAfterPhoto(prefix, data), `✅ ${ID_PHOTO_LABEL[kind]} मिल गया।`);
  }

  /** Text while a photo is expected: "बाद में" skips it (staff check), anything else asks again. */
  private async idPhotoText(cur: any, data: any, v: string): Promise<string[]> {
    const [, prefix, kind] = cur.step.match(idStepRe) as [string, string, IdPhotoKind];
    if (!(LATER.test(v) || SKIP.test(v) || /नहीं है|नही है|nahi hai|not available/i.test(v))) {
      return [`कृपया ${ID_PHOTO_LABEL[kind]} की फ़ोटो भेजें। ${ID_LATER_HINT}`];
    }
    data.idPhotos = { ...(data.idPhotos ?? {}), [prefix]: { ...(data.idPhotos?.[prefix] ?? {}), [kind]: "later" } };
    await this.save(cur.id, { needsStaff: true });
    return this.goto(cur.id, data, this.nextAfterPhoto(prefix, data), `ठीक है, ${ID_PHOTO_LABEL[kind]} बाद में भेज दें।`);
  }

  /** "ये सही है?" after reading a card: हाँ fills the fields, बदलें leaves them to be typed. */
  private async idConfirm(cur: any, data: any, v: string): Promise<string[]> {
    const [, prefix, card] = cur.step.match(idOkRe) as [string, string, "aadhaar" | "pan"];
    const yes = YES.test(v);
    if (!yes && !(/बदल|change|edit|गलत|galat|wrong/i.test(v) || NO.test(v))) {
      return ['कृपया "हाँ" या "बदलें" लिखें।\n\n' + this.question(cur.step, data)];
    }
    const pend = { ...(data.idPending?.[prefix] ?? {}) };
    const read = { ...(data.idRead?.[prefix] ?? {}) };
    if (card === "aadhaar") {
      pend.aadhaarOk = yes;
      if (yes && pend.aadhaar) {
        const a = pend.aadhaar;
        if (a.name) data[`${prefix}Name`] = stripHonorific(a.name);
        if (a.aadhaar) data[`${prefix}Aadhaar`] = a.aadhaar; // already encrypted
        if (a.address) data[`${prefix}Address`] = a.address;
        if (a.dob) data[`${prefix}Dob`] = a.dob;
        if (a.gender) data[`${prefix}Gender`] = a.gender;
        read.aadhaarName = a.name ?? null;
        read.aadhaarNameEn = a.nameEn ?? null;
      }
    } else {
      pend.panOk = yes;
      if (yes && pend.pan) {
        const p = pend.pan;
        data[`${prefix}Pan`] = p.pan; // already encrypted
        if (p.dob && !data[`${prefix}Dob`]) data[`${prefix}Dob`] = p.dob;
        read.panName = p.nameEn ?? null;
        read.panFather = p.fatherEn ?? null;
      }
    }
    data.idPending = { ...(data.idPending ?? {}), [prefix]: pend };
    data.idRead = { ...(data.idRead ?? {}), [prefix]: read };
    return this.goto(cur.id, data, this.nextAfterPhoto(prefix, data), yes ? "✅ ठीक है, यही जानकारी भर दी गई।" : "ठीक है, यह जानकारी आगे लिखकर भेजें।");
  }

  private idConfirmAsk(step: string, data: any): string {
    const [, prefix, card] = step.match(idOkRe) as [string, string, "aadhaar" | "pan"];
    const pend = data.idPending?.[prefix] ?? {};
    const lines: string[] = [];
    if (card === "aadhaar") {
      const a = pend.aadhaar ?? {};
      lines.push(`${partyWho(prefix)} के आधार कार्ड से यह जानकारी पढ़ी गई:`);
      if (a.name) lines.push(`नाम: ${a.name}`);
      if (a.dob) lines.push(`जन्म तिथि: ${a.dob}`);
      if (a.gender) lines.push(`लिंग: ${a.gender}`);
      if (a.aadhaar) lines.push(`आधार: ${aadhaarSpaced(mask(decrypt(a.aadhaar)))}`);
      if (a.address) lines.push(`पता: ${a.address}`);
    } else {
      const p = pend.pan ?? {};
      lines.push(`${partyWho(prefix)} के PAN कार्ड से यह जानकारी पढ़ी गई:`);
      if (p.nameEn) lines.push(`नाम: ${p.nameEn}`);
      if (p.fatherEn) lines.push(`पिता का नाम: ${p.fatherEn}`);
      if (p.dob) lines.push(`जन्म तिथि: ${p.dob}`);
      if (p.pan) lines.push(`PAN: ${mask(decrypt(p.pan))}`);
    }
    lines.push("", 'क्या यह सही है? सही है तो "हाँ" लिखें, नहीं तो "बदलें" लिखें (तब जानकारी लिखकर भेजनी होगी)।');
    return lines.join("\n");
  }

  private question(step: string, data: any): string {
    if (step === "AMOUNT") return AMOUNT_ASK;
    if (step === "CONFIRM_PROPERTY") return "कृपया \"हाँ\" या \"नहीं\" लिखें।";
    if (step === "FINAL") return this.finalSummary(data);
    if (step === "CHOOSE_DEED") return CHOOSE_DEED_ASK;
    if (step === "OTHER_DESC") return OTHER_ASK;
    if (step === "M_FIRST_DOC") return M_FIRST_DOC_ASK;
    if (step === "M_SANCTION") return M_SANCTION_ASK;
    if (step === "M_REGISTRY") return M_REGISTRY_ASK;
    if (step === "M_TRANSFER") return M_TRANSFER_ASK;
    if (step === "M_OWNER") return ownerAsk(data);
    const idm = step.match(idStepRe);
    if (idm) {
      const tries = data.idTries?.[idm[1]!]?.[idm[2]!] ?? 0;
      return (tries ? ID_RETRY : ID_ASK[idm[2] as IdPhotoKind](partyWho(idm[1]!))) + "\n" + ID_LATER_HINT;
    }
    if (idOkRe.test(step)) return this.idConfirmAsk(step, data);
    const plot = PLOT_STEPS.find((s) => s.key === step);
    if (plot) return plot.ask;
    if (step === PAN_STEP.key && !data.tax?.panRequired) return PAN_STEP.ask + " PAN न हो तो \"नहीं\" लिखें।";
    const fm = step.match(/^(.*)FatherName$/);
    if (fm) {
      const who = ANY_STEPS.find((s) => s.key === `${fm[1]}Name`)?.ask.split(" का पूरा नाम")[0] ?? "";
      const wife = data[`${fm[1]}Relation`] === "पत्नी";
      return `${who} के ${wife ? "पति" : "पिता"} का नाम लिखें।`;
    }
    return ANY_STEPS.find((s) => s.key === step)?.ask ?? "";
  }
}
