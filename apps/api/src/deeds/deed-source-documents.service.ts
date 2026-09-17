import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { checkSellerNames, type NameWarning } from "./seller-name-check.js";
import { PartyMembersService, memberFacts } from "./party-members.service.js";

/** Prisma's type for a Bytes column; Buffer is the same bytes, typed wider. */
type DocBytes = Prisma.DeedSourceDocumentCreateInput["data"];

export interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/**
 * Whose paper a document is. Uploaded into separate slots, so the deed is
 * filled from what the drafter said rather than from a guess at whose name is
 * printed on a card.
 */
export type DocumentRole = "seller" | "buyer" | "property";
export const DOCUMENT_ROLES: DocumentRole[] = ["seller", "buyer", "property"];

export function parseDocumentRole(raw: unknown): DocumentRole {
  if (raw === "seller" || raw === "buyer" || raw === "property") return raw;
  throw new BadRequestException("role must be seller, buyer or property.");
}

/** One thing the model found in a document, ready to drop into the deed. */
export interface ExtractedField {
  /** Hindi label as it reads in a deed, e.g. "पति का नाम". */
  label: string;
  value: string;
  /** Which side of the deed this belongs to, so the panel can group it. */
  group: "party" | "property" | "other";
}

/** One edit the model proposes to the deed, before anyone agrees to it. */
export interface ProposedFill {
  /** Which part of the deed this edits -- never one nobody uploaded for. */
  role: DocumentRole;
  /** Exact text in the deed to replace. Must occur exactly once. */
  find: string;
  replace: string;
  /** Hindi note on what this is, e.g. "क्रेता का नाम" -- shown in the review. */
  why: string;
}

/** Saved people (party ids) the drafter placed in the seller or buyer slot. */
export interface PickedPeople {
  seller: string[];
  buyer: string[];
  /**
   * For a picked firm: which of its saved partners sign this deed, in the
   * order the deed lists them. A firm left out brings all its partners.
   */
  signers?: Record<string, string[]>;
}

export const NO_PEOPLE: PickedPeople = { seller: [], buyer: [] };

/** At most this many people per slot -- a deed, not a mailing list. */
const MAX_PICKED = 10;

/** Reads `{seller: [...ids], buyer: [...ids], signers: {firmId: [...ids]}}` from a request body, dropping anything else. */
export function parsePickedPeople(raw: unknown): PickedPeople {
  if (!raw || typeof raw !== "object") return NO_PEOPLE;
  const isId = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 64;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isId))].slice(0, MAX_PICKED) : []);
  const r = raw as Record<string, unknown>;
  const out: PickedPeople = { seller: ids(r.seller), buyer: ids(r.buyer) };
  if (r.signers && typeof r.signers === "object" && !Array.isArray(r.signers)) {
    const firms = [...out.seller, ...out.buyer];
    const signers: Record<string, string[]> = {};
    for (const [firmId, list] of Object.entries(r.signers as Record<string, unknown>)) {
      if (firms.includes(firmId) && Array.isArray(list)) signers[firmId] = ids(list);
    }
    if (Object.keys(signers).length > 0) out.signers = signers;
  }
  return out;
}

/** The firm's saved partners who sign this deed: the chosen ones in the chosen order, or all of them. */
export function chosenSigners<T extends { personId: string }>(members: T[], chosen: string[] | undefined): T[] {
  if (!chosen) return members;
  const byId = new Map(members.map((m) => [m.personId, m]));
  return chosen.flatMap((id) => {
    const m = byId.get(id);
    return m ? [m] : [];
  });
}

/** Which sides of the deed are an organisation rather than a person. */
export interface PartySides {
  seller: boolean;
  buyer: boolean;
}

export const NO_ORGANISATIONS: PartySides = { seller: false, buyer: false };

/** Reads `{seller: "organisation" | "individual", buyer: ...}`; anything else is a person. */
export function parseOrganisations(raw: unknown): PartySides {
  if (!raw || typeof raw !== "object") return NO_ORGANISATIONS;
  const r = raw as Record<string, unknown>;
  return { seller: r.seller === "organisation", buyer: r.buyer === "organisation" };
}

/** Labels that carry a party's own name, for a person and for an organisation. */
const PARTY_NAME_LABELS = new Set(["नाम", "संस्था का नाम"]);

/** "123456789012" -> "1234 5678 9012", the way deeds write it. */
function groupAadhaar(a: string): string {
  const d = a.replace(/[^0-9]/g, "");
  return d.length === 12 ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}` : a;
}

export interface FillProposal {
  fills: ProposedFill[];
  /**
   * Things the changes would leave behind that belong to whoever is being
   * replaced -- the previous buyer's PAN, say, when the new buyer's card had
   * none. Hindi, ready to show above the list.
   */
  warnings: string[];
  /** Edits the model asked for that could not be placed safely, with reasons. */
  skipped: { why: string; reason: string }[];
}

export interface SourceDocumentItem {
  id: string;
  role: DocumentRole;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedByName: string | null;
  /** null while it has not been read yet. */
  extracted: ExtractedField[] | null;
  extractError: string | null;
}

/** 15MB, the same ceiling the other upload routes use. */
export const MAX_SOURCE_DOC = 15 * 1024 * 1024;

/**
 * What the model is allowed to send back. Anything outside this is dropped
 * rather than trusted: these values are about to be offered for pasting into a
 * legal document, so a malformed or over-long field is a bug worth swallowing
 * loudly on our side instead of showing to a user.
 */
const MAX_FIELDS = 40;
const MAX_LABEL_LEN = 60;
const MAX_VALUE_LEN = 400;

const SYSTEM_PROMPT = `You read Indian property paperwork and pull out the facts a Hindi deed needs.

The document may be an Aadhaar card, a PAN card, a khasra/B1 extract, a
bhu-adhikar rin pustika, an older registered deed, a map, a tax receipt, or
anything else about one property. Work with whatever it is.

Return ONLY a JSON array, no prose, no markdown fence. Each item:
  {"label": "<Hindi label>", "value": "<exact value>", "group": "party"|"property"|"other"}

Rules:
- Labels must be the Hindi wording a deed uses, e.g. "नाम", "पता", "आधार नं.",
  "पैन नं.", "जन्म तिथि", "लिंग", "खसरा नं.", "रकबा", "ग्राम", "प.ह.नं.",
  "तहसील", "जिला", "CLR No.", "भूमि का प्रकार".
- Keep the relation the document states -- a deed writes "पुत्र श्री",
  "पुत्री श्री" or "पत्नी श्री" from it, and getting it wrong changes who the
  person is. Use "पिता का नाम" for S/O, D/O or पिता; "पति का नाम" for W/O or
  पति; "संरक्षक का नाम" for C/O. Never merge them into one label.
- For a person, include "लिंग" (पुरुष / महिला) when the card shows it.
- For a firm, company, bank, society or trust, use "संस्था का नाम",
  "संस्था का प्रकार" (फर्म / कंपनी / बैंक / सोसाइटी / ट्रस्ट), "पैन नं.",
  "GSTIN", "पंजीयन क्रमांक" (CIN or registration number) and "संस्था का पता".
  For each person the paper authorises to sign -- partners in a partnership
  deed, directors in a board resolution -- give "अधिकृत व्यक्ति" (their name)
  and "पद" (पार्टनर / डायरेक्टर / प्रोप्राइटर / प्रबंधक) as a pair, in order.
- On a land record (khasra, B-1, rin pustika), give each owner as its own
  "भूमिस्वामी का नाम" item, with the relation exactly as the record prints it
  (e.g. "ओतारसिंह पुत्र बालाराम"). Do not label an owner plain "नाम".
- group "party" for facts about a person or company; "property" for facts about
  the land or building; "other" for anything else worth keeping.
- Copy values exactly as printed. Do not translate names or places. Keep the
  document's own script for names.
- Never guess. If a field is unreadable or absent, leave it out entirely. An
  empty array is a correct answer for a document with nothing useful in it.
- No commentary, no confidence scores, no fields you inferred rather than read.`;

const PLACEMENT_PROMPT = `You are given a Hindi property deed and facts read off the
paperwork behind it, already sorted by whose paper they came from:
SELLER (विक्रेता), BUYER (क्रेता), PROPERTY (सम्पत्ति / भुगतान). Say where each
fact belongs in the deed.

Return ONLY a JSON array, no prose, no markdown fence. Each item:
  {"role": "seller"|"buyer"|"property", "find": "<exact text copied from the deed>", "replace": "<what it becomes>", "why": "<short Hindi note>"}

Rules:
- "role" is the section you are editing: seller facts go in the विक्रेता
  section, buyer facts in the क्रेता section, property and payment facts in the
  property description, boundaries, area and बिक्रीधन / भुगतान sentences. The
  sorting is given -- do not re-decide whose a fact is.
- Only edit sections you were given facts for. If no SELLER facts are given,
  leave the विक्रेता section exactly as it is, whatever it says. Same for BUYER
  and PROPERTY.
- "find" MUST be copied character for character from the deed, and must appear
  there EXACTLY ONCE. Include enough surrounding words to make it unique --
  a bare "........" almost never is. Never invent or normalise the text.
- Replace blanks ("........", "<...>", "______") or the previous party's or
  property's details in a deed that was copied from another one. Leave the
  legal wording alone -- you are filling in a form, not rewriting a contract.
- Write the relation from the facts, never by habit: "पति का नाम" gives
  "पत्नी श्री <name>"; "पिता का नाम" gives "पुत्र श्री <name>" for a man and
  "पुत्री श्री <name>" for a woman (see "लिंग"). If the facts give only
  "संरक्षक का नाम", or do not say, leave the deed's relation word unchanged.
- Keep the deed's own way of writing an Aadhaar number. Where the spot reads
  "XXXX XXXX ....", write "XXXX XXXX" and the last four digits only; where the
  deed writes numbers in full, write it in full.
- Never blank anything out. "replace" must always carry a real value; if you
  have no value for a spot, do not include that spot at all.
- Never guess. If you cannot tell where a fact goes, leave it out. Fewer,
  certain placements beat more, doubtful ones.`;

/**
 * Paperwork a deed was drafted from, and the model's reading of it.
 *
 * Documents are stored first and read second, deliberately: a failed or slow
 * extraction must never cost someone the upload, and the file is the thing
 * that matters -- the extraction is a convenience on top of it.
 */
@Injectable()
export class DeedSourceDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partyMembers: PartyMembersService,
  ) {}

  async list(deedId: string): Promise<SourceDocumentItem[]> {
    const rows = await this.prisma.deedSourceDocument.findMany({
      where: { deedId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        uploadedByName: true,
        extracted: true,
        extractError: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      role: asRole(r.role),
      fileName: r.fileName,
      mimeType: r.mimeType,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
      uploadedByName: r.uploadedByName,
      extracted: normalizeFields(r.extracted),
      extractError: r.extractError,
    }));
  }

  /** The bytes, for the preview pane. */
  async file(id: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await this.prisma.deedSourceDocument.findUnique({
      where: { id },
      select: { fileName: true, mimeType: true, data: true },
    });
    if (!row) throw new NotFoundException("Document not found.");
    return { fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data) };
  }

  /**
   * Store the file, then try to read it. The row is returned either way, with
   * `extractError` set when the read failed, so the panel can offer a retry
   * against a file that is already safely saved.
   */
  async add(deedId: string, file: UploadedDoc, role: DocumentRole, user: StaffUser): Promise<SourceDocumentItem> {
    if (!file?.buffer?.length) throw new BadRequestException("A file is required.");
    if (file.buffer.length > MAX_SOURCE_DOC) throw new BadRequestException("That file is too large.");

    const mimeType = resolveMimeType(file.mimetype, file.originalname);
    const row = await this.prisma.deedSourceDocument.create({
      data: tenantCreateData<Prisma.DeedSourceDocumentUncheckedCreateInput>({
        deedId,
        role,
        fileName: file.originalname ?? "document",
        mimeType,
        size: file.buffer.length,
        data: file.buffer as unknown as DocBytes,
        uploadedById: user.id,
        uploadedByName: user.name,
      }),
      select: { id: true },
    });

    return this.read(row.id);
  }

  /**
   * Read (or re-read) one stored document. Separate from `add` so a document
   * that failed the first time -- a timeout, a missing key, a bad scan -- can be
   * retried without uploading it again.
   */
  async read(id: string): Promise<SourceDocumentItem> {
    const row = await this.prisma.deedSourceDocument.findUnique({
      where: { id },
      select: { id: true, role: true, fileName: true, mimeType: true, size: true, data: true, createdAt: true, uploadedByName: true },
    });
    if (!row) throw new NotFoundException("Document not found.");

    let extracted: ExtractedField[] | null = null;
    let extractError: string | null = null;
    try {
      extracted = await extractFields(Buffer.from(row.data), row.mimeType);
    } catch (e) {
      extractError = (e as Error).message || "Could not read this document.";
    }

    await this.prisma.deedSourceDocument.update({
      where: { id },
      data: { extracted: (extracted ?? undefined) as Prisma.InputJsonValue | undefined, extractError },
    });

    return {
      id: row.id,
      role: asRole(row.role),
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt.toISOString(),
      uploadedByName: row.uploadedByName,
      extracted,
      extractError,
    };
  }

  /**
   * Where the facts read off the paperwork belong in this deed.
   *
   * Proposes, never writes. The caller shows the list and only applies what a
   * person agrees to, because "seller's Aadhaar" and "buyer's Aadhaar" look
   * identical to a reader of the card and differ only by where they land.
   *
   * Every proposed edit is checked against the deed before it is offered: the
   * text to replace must be present exactly once. A model that paraphrases the
   * deed, or picks a string occurring twice, gets its edit dropped with a
   * reason rather than applied to the wrong line.
   */
  /**
   * Saved people the drafter put in the seller or buyer slot, as facts for
   * that slot -- read here, from the workspace's own records (tenant-scoped),
   * never taken from the browser. Unknown ids are simply not found.
   */
  private async pickedPeople(people: PickedPeople): Promise<Record<"seller" | "buyer", { name: string; facts: ExtractedField[] }[]>> {
    const ids = [...new Set([...people.seller, ...people.buyer])];
    if (ids.length === 0) return { seller: [], buyer: [] };
    const rows = await this.prisma.party.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, partyType: true, address: true, aadhaarNumber: true, panNumber: true, dob: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    // An organisation comes with the people who act for it, so picking the
    // firm replaces the previous firm's partners too.
    const signatories = await this.partyMembers.membersOf(rows.filter((r) => r.partyType === "company").map((r) => r.id));
    const toFacts = (id: string) => {
      const r = byId.get(id);
      if (!r) return [];
      const isOrg = r.partyType === "company";
      const facts: ExtractedField[] = [{ label: isOrg ? "संस्था का नाम" : "नाम", value: r.name, group: "party" }];
      if (r.address) facts.push({ label: "पता", value: r.address, group: "party" });
      if (r.aadhaarNumber) facts.push({ label: "आधार नं.", value: groupAadhaar(r.aadhaarNumber), group: "party" });
      if (r.panNumber) facts.push({ label: "पैन नं.", value: r.panNumber, group: "party" });
      if (r.dob) facts.push({ label: "जन्म तिथि", value: r.dob, group: "party" });
      if (isOrg) {
        // memberFacts sorts by position; renumber so the chosen order holds.
        const signing = chosenSigners(signatories.get(r.id) ?? [], people.signers?.[r.id]);
        facts.push(...memberFacts(signing.map((m, position) => ({ ...m, position }))));
      }
      return [{ name: r.name, facts }];
    };
    return { seller: people.seller.flatMap(toFacts), buyer: people.buyer.flatMap(toFacts) };
  }

  async proposeFill(
    deedId: string,
    farmland: boolean,
    people: PickedPeople = NO_PEOPLE,
    orgs: PartySides = NO_ORGANISATIONS,
    only?: SingleFact,
  ): Promise<FillProposal> {
    const deed = await this.prisma.deedTemplate.findUnique({
      where: { id: deedId },
      select: { content: true },
    });
    if (!deed) throw new NotFoundException("Deed not found.");
    if (!deed.content.trim()) throw new BadRequestException("This deed has no text yet.");

    const docs = await this.list(deedId);
    const byRole: Record<DocumentRole, ExtractedField[]> = { seller: [], buyer: [], property: [] };
    for (const d of docs) byRole[d.role].push(...(d.extracted ?? []));
    const picked = await this.pickedPeople(people);
    for (const role of ["seller", "buyer"] as const) {
      for (const person of picked[role]) byRole[role].push(...person.facts);
    }
    const given = new Set(DOCUMENT_ROLES.filter((r) => byRole[r].length > 0));
    if (given.size === 0) {
      throw new BadRequestException("Nothing has been read from the documents yet.");
    }

    const raw = await proposePlacements(deed.content, byRole, farmland, orgs, only);

    const fills: ProposedFill[] = [];
    const skipped: { why: string; reason: string }[] = [];
    for (const item of raw) {
      // Asked for one fact: nothing else in the deed moves.
      if (only && item.role !== only.role) continue;
      // A part of the deed nobody uploaded papers for keeps what it has. The
      // prompt says so; this makes it true even if the model does not listen.
      if (!given.has(item.role)) {
        skipped.push({ why: item.why, reason: "इस हिस्से के कागज़ नहीं डाले गए, इसलिए जैसा है वैसा रखा।" });
        continue;
      }
      // Filling never empties anything.
      if (wouldEmpty(item.find, item.replace)) {
        skipped.push({ why: item.why, reason: "इसमें भरने के लिए कोई मान नहीं था।" });
        continue;
      }
      if (relationMismatch(item.replace, byRole[item.role])) {
        skipped.push({ why: item.why, reason: "रिश्ता (पुत्र/पुत्री/पत्नी) कागज़ से मेल नहीं खाता, इसलिए छोड़ा गया।" });
        continue;
      }
      const count = countOccurrences(deed.content, item.find);
      if (count === 0) {
        skipped.push({ why: item.why, reason: "यह हिस्सा विलेख में नहीं मिला।" });
        continue;
      }
      if (count > 1) {
        skipped.push({ why: item.why, reason: `यह हिस्सा विलेख में ${count} जगह है, इसलिए छोड़ा गया।` });
        continue;
      }
      const replace = matchAadhaarStyle(item.find, item.replace);
      if (item.find === replace) continue;
      fills.push({ ...item, replace });
    }
    // What the deed would read like with every offered change, to see what of
    // the person being replaced would still be there.
    let after = deed.content;
    for (const fill of fills) after = after.replace(fill.find, fill.replace);
    const warnings: string[] = [];
    for (const side of ["seller", "buyer"] as const) {
      if (!fills.some((x) => x.role === side)) continue;
      const left = leftoverIdentifiers(deed.content, after, side, byRole[side]);
      if (left.length === 0) continue;
      const who = side === "seller" ? "विक्रेता" : "क्रेता";
      warnings.push(
        `पिछले ${who} का ${left.join(", ")} विलेख में रह जाएगा — नए ${who} के कागज़ में यह नहीं था। लगाने के बाद इसे बदलें या हटाएँ।`,
      );
    }
    return { fills, warnings, skipped };
  }

  /**
   * For farmland: do the seller's IDs match the owners the land record names?
   *
   * Uses what has already been read, so it costs nothing to ask again after
   * every upload. Without a land record there is nothing to compare against
   * and the answer is simply empty.
   */
  async nameCheck(
    deedId: string,
    onScreen?: string,
    people: PickedPeople = NO_PEOPLE,
  ): Promise<{ owners: string[]; warnings: NameWarning[] }> {
    const deed = await this.prisma.deedTemplate.findUnique({
      where: { id: deedId },
      select: { content: true },
    });
    if (!deed) throw new NotFoundException("Deed not found.");
    // The editor's text when it sends one (it is ahead of the saved copy),
    // capped like everything else that reads a deed.
    const deedText = (onScreen ?? deed.content).slice(0, MAX_DEED_CHARS);

    const docs = await this.list(deedId);
    const sellerDocs = docs.filter((d) => d.role === "seller");
    const owners = ownerNamesOf(docs.filter((d) => d.role === "property").flatMap((d) => d.extracted ?? []));
    // One name per seller ID: the card's own name field.
    const sellerNames = sellerDocs
      .map((d) => (d.extracted ?? []).find((f) => PARTY_NAME_LABELS.has(f.label))?.value)
      .filter((n): n is string => !!n);
    // A saved person picked as seller is checked the same way as an uploaded ID.
    if (owners.length > 0 && people.seller.length > 0) {
      const picked = await this.pickedPeople({ seller: people.seller, buyer: [] });
      sellerNames.push(...picked.seller.map((p) => p.name));
    }

    return {
      owners,
      warnings: checkSellerNames({ sellerNames, ownerNames: owners, deedText }),
    };
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.deedSourceDocument.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException("Document not found.");
    await this.prisma.deedSourceDocument.delete({ where: { id } });
  }
}

/** What Anthropic accepts as an image block; anything else goes as a document. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * The file's real type. Browsers on Windows sometimes send a dragged PDF as
 * "application/octet-stream" or with no type at all, which would store the
 * file but refuse to read it -- so fall back to the file name's extension.
 */
export function resolveMimeType(sent: string | undefined, fileName: string | undefined): string {
  const given = (sent ?? "").toLowerCase();
  if (given === "application/pdf" || IMAGE_TYPES.has(given)) return given;
  if (given === "image/jpg" || given === "image/pjpeg") return "image/jpeg";
  const ext = (fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return TYPE_BY_EXTENSION[ext] ?? (given || "application/octet-stream");
}

async function extractFields(data: Buffer, mimeType: string): Promise<ExtractedField[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Reading documents is not set up on the server yet (ANTHROPIC_API_KEY is missing).");

  const isImage = IMAGE_TYPES.has(mimeType);
  const isPdf = mimeType === "application/pdf";
  if (!isImage && !isPdf) {
    throw new Error(
      "सिर्फ़ JPG, PNG, WEBP फ़ोटो और PDF पढ़े जा सकते हैं। यह फ़ाइल सहेज ली गई है, पर पढ़ी नहीं गई — " +
        "iPhone की HEIC फ़ोटो हो तो JPG में बदलकर डालें।",
    );
  }

  const block = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: data.toString("base64") } };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [block, { type: "text", text: "Pull out everything a Hindi deed would need from this." }],
        },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Reading failed (HTTP ${res.status}).`);

  const body = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string };
  if (body.stop_reason === "max_tokens") throw new Error("The document was too long to finish reading in one go.");
  const text = body.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("Nothing came back for this document.");

  const parsed = parseFields(text);
  if (!parsed) throw new Error("Could not make sense of this document.");
  return parsed;
}

/**
 * The JSON array out of a model reply.
 *
 * Both prompts ask for bare JSON and both get a ```json fence most of the
 * time, an apologetic line before it some of the time. Rather than chase each
 * shape, take the span from the first "[" to the last "]" -- the array is the
 * only bracketed thing either prompt can produce.
 */
function parseJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseFields(text: string): ExtractedField[] | null {
  return normalizeFields(parseJsonArray(text));
}

/**
 * Shared by the parse path and by reads of the cached column, so a row written
 * by an older version of this code cannot put a malformed field on screen.
 */
function normalizeFields(raw: unknown): ExtractedField[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ExtractedField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, value, group } = item as Record<string, unknown>;
    if (typeof label !== "string" || typeof value !== "string") continue;
    const l = label.trim();
    const v = value.trim();
    if (!l || !v || l.length > MAX_LABEL_LEN || v.length > MAX_VALUE_LEN) continue;
    out.push({
      label: l,
      value: v,
      group: group === "party" || group === "property" ? group : "other",
    });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

/** Reads the stored column, which the database defaults but does not constrain. */
function asRole(raw: string): DocumentRole {
  return raw === "seller" || raw === "buyer" ? raw : "property";
}

/**
 * A party's entry in the deed: from its heading to the next party heading or
 * the first "यह कि" of the body. Empty when the deed does not use the heading.
 */
export function partyEntry(text: string, side: "seller" | "buyer"): string {
  const t = text.replace(/[\u200b-\u200d\ufeff]/g, "");
  const sellerAt = t.search(/(^|\n)\s*विक्रेता/);
  const buyerAt = t.search(/(^|\n)\s*क्रेता\s*पक्ष/);
  if (sellerAt === -1 || buyerAt === -1 || buyerAt < sellerAt) return "";
  if (side === "seller") return t.slice(sellerAt, buyerAt);
  const rest = t.slice(buyerAt);
  const bodyAt = rest.search(/\n\s*यह\s*कि/);
  return bodyAt === -1 ? rest.slice(0, 600) : rest.slice(0, bodyAt);
}

const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const AADHAAR_RE = /(?<![\dX])\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/g;

/**
 * Identifiers of the person being replaced that would survive the change.
 *
 * When a copied deed's buyer is swapped for a new one, anything the new
 * paperwork did not supply -- a PAN, most often -- keeps the old person's
 * value, and a deed that names one buyer with another's PAN is worse than one
 * with a blank. A side counts as being replaced when a change to it touches
 * its entry; an identifier counts as left over when it is in that entry before
 * and after, and is not one the new paperwork gave.
 */
export function leftoverIdentifiers(
  before: string,
  after: string,
  side: "seller" | "buyer",
  facts: ExtractedField[],
): string[] {
  const was = partyEntry(before, side);
  const now = partyEntry(after, side);
  if (!was || was === now) return [];
  const digits = (s: string) => s.replace(/\D/g, "");
  const given = new Set(facts.map((f) => f.value.toUpperCase().replace(/\s/g, "")));
  const givenDigits = new Set(facts.map((f) => digits(f.value)).filter((d) => d.length === 12));
  const out: string[] = [];
  for (const pan of new Set(was.match(PAN_RE) ?? [])) {
    if (now.includes(pan) && !given.has(pan)) out.push(pan);
  }
  for (const a of new Set(was.match(AADHAAR_RE) ?? [])) {
    if (now.includes(a) && !givenDigits.has(digits(a))) out.push(a);
  }
  return out;
}

/**
 * Keep the deed's way of writing Aadhaar. Where the text being replaced shows
 * "XXXX XXXX", every full number in the replacement is cut to its last four
 * digits. The prompt asks for this too; on a test deed it was followed one run
 * and not the next, and a full Aadhaar in a deed is not a thing to leave to a
 * coin toss.
 */
export function matchAadhaarStyle(find: string, replace: string): string {
  if (!/X{4}\s*X{4}/i.test(find)) return replace;
  return replace.replace(/(?<!\d)\d{4}[ -]?\d{4}[ -]?(\d{4})(?!\d)/g, "XXXX XXXX $1");
}

/** Filler runs, angle-bracket prompts and underscore lines. */
const BLANK = /\.{4,}|<[^<>]*>|_{3,}/g;

function countBlanks(text: string): number {
  return (text.match(BLANK) ?? []).length;
}

/**
 * True when an edit would empty something out: a replacement with nothing in
 * it, or one that leaves more blanks than the text it replaces. Filling one of
 * two blanks in a line is fine; turning a written name back into dots is not.
 */
export function wouldEmpty(find: string, replace: string): boolean {
  return !replace.trim() || countBlanks(replace) > countBlanks(find);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deed text is full of zero-width joiners ("पत्‍नी"); compare without them. */
function stripJoiners(s: string): string {
  return s.replace(/[\u200b-\u200d\ufeff]/g, "");
}

/** "श्री अजय वर्मा" -> "अजय वर्मा", so a name matches with or without the honorific. */
function bareName(s: string): string {
  return stripJoiners(s).replace(/^\s*(श्रीमती|श्री|स्व\.?)\s*/, "").trim();
}

/**
 * True when an edit writes the wrong relation for a name the papers gave: a
 * husband written as "पुत्र/पुत्री श्री <him>", or a father as "पत्नी श्री <him>".
 * One word, and the deed describes a different family -- so this is checked
 * here rather than trusted to the prompt.
 */
export function relationMismatch(replace: string, facts: ExtractedField[]): boolean {
  const text = stripJoiners(replace);
  for (const f of facts) {
    const name = bareName(f.value);
    if (!name) continue;
    const n = escapeRegExp(name);
    if (f.label === "पति का नाम" && new RegExp(`(पुत्र|पुत्री)\\s*(श्री)?\\s*${n}`).test(text)) return true;
    if (f.label === "पिता का नाम" && new RegExp(`पत्नी\\s*(श्री)?\\s*${n}`).test(text)) return true;
  }
  return false;
}

/** How many times `needle` occurs in `hay` -- plain scan, no regex escaping. */
function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/** The deed is sent whole: placement depends on wording far from the blank. */
const MAX_DEED_CHARS = 40000;

/**
 * Owner names read off the land-record papers. Older reads, from before the
 * reader was told to say "भूमिस्वामी का नाम", labelled the owner plain "नाम";
 * on a property paper that can only be the owner, so it counts too.
 */
const OWNER_LABELS = new Set(["भूमिस्वामी का नाम", "कृषक का नाम", "खातेदार का नाम", "नाम"]);

export function ownerNamesOf(propertyFacts: ExtractedField[]): string[] {
  return propertyFacts.filter((f) => OWNER_LABELS.has(f.label)).map((f) => f.value);
}

function sideIsOrganisation(role: DocumentRole, orgs: PartySides): boolean {
  return role !== "property" && orgs[role];
}

const ROLE_HEADING: Record<DocumentRole, string> = {
  seller: "SELLER (विक्रेता) के कागज़ों से",
  buyer: "BUYER (क्रेता) के कागज़ों से",
  property: "PROPERTY (सम्पत्ति / भुगतान) के कागज़ों से",
};

/**
 * How a deed writes a party that is an organisation. Said only for the sides
 * that are one: for a person, the ID's own shape is right.
 */
const ORGANISATION_NOTE =
  "जो पक्ष संस्था है (फर्म / कंपनी / बैंक / सोसाइटी / ट्रस्ट), उसे विलेख के इसी ढंग से लिखें: " +
  '"<संस्था का नाम> (पेन.नं. <पैन>) द्वारा <पद> 1. श्री <अधिकृत व्यक्ति> ... 2. श्री ..."। ' +
  "पुत्र / पत्नी श्री वाला रिश्ता संस्था के नाम पर कभी न लगाएँ, केवल अधिकृत व्यक्तियों के साथ लिखें। " +
  "संस्था का आधार नहीं होता — आधार नंबर केवल अधिकृत व्यक्ति का लिखें। विलेख में पहले से जो ढंग है, वही रखें।";

/**
 * For farmland the deed names the seller as the land record does. Said once,
 * here, rather than in the general prompt, because for a flat or a shop the ID
 * is the right source.
 */
const FARMLAND_NOTE =
  "यह विलेख कृषि भूमि का है। विक्रेता का नाम (और रिश्ता — पुत्र/पत्नी श्री ...) ठीक वैसा ही लिखें जैसा " +
  "PROPERTY के कागज़ों में \"भूमिस्वामी का नाम\" में है, ID पर छपे नाम से नहीं। विक्रेता की ID से केवल " +
  "आधार/पैन नंबर, पता और जन्म तिथि लें।";

/** One fact the drafter asked to place on its own, from the "what was found" list. */
export interface SingleFact {
  role: DocumentRole;
  label: string;
  value: string;
}

/** Reads `{role, label, value}`; anything malformed means "fill everything". */
export function parseSingleFact(raw: unknown): SingleFact | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { role, label, value } = raw as Record<string, unknown>;
  if (role !== "seller" && role !== "buyer" && role !== "property") return undefined;
  if (typeof label !== "string" || typeof value !== "string") return undefined;
  if (!label.trim() || !value.trim() || label.length > 80 || value.length > 400) return undefined;
  return { role, label: label.trim(), value: value.trim() };
}

function singleFactNote(only: SingleFact): string {
  return [
    "केवल यह एक तथ्य विलेख में सही जगह भरें:",
    `${ROLE_HEADING[only.role]} — ${only.label}: ${only.value}`,
    "ऊपर के बाकी तथ्य केवल यह समझने के लिए हैं कि यह किस व्यक्ति या हिस्से का है; उनके लिए कोई बदलाव न लौटाएँ।",
    "जो बदलाव लौटाएँ उसकी role यही हो। यदि विलेख में यह पहले से सही लिखा है तो [] लौटाएँ।",
  ].join("\n");
}

async function proposePlacements(
  deedText: string,
  byRole: Record<DocumentRole, ExtractedField[]>,
  farmland: boolean,
  orgs: PartySides,
  only?: SingleFact,
): Promise<ProposedFill[]> {
  const heading = (r: DocumentRole) =>
    ROLE_HEADING[r] + (sideIsOrganisation(r, orgs) ? " — यह पक्ष एक संस्था है" : "");
  const factsText = DOCUMENT_ROLES.map((r) =>
    byRole[r].length
      ? heading(r) + ":\n" + byRole[r].map((f) => "- " + f.label + ": " + f.value).join("\n")
      : heading(r) + ": (कोई कागज़ नहीं डाला गया -- यह हिस्सा न छुएँ)",
  ).join("\n\n");
  const notes: string[] = [];
  if (orgs.seller || orgs.buyer) notes.push(ORGANISATION_NOTE);
  if (farmland && ownerNamesOf(byRole.property).length > 0) notes.push(FARMLAND_NOTE);
  if (only) notes.push(singleFactNote(only));
  const note = notes.length ? "\n\n" + notes.join("\n\n") : "";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new BadRequestException("Filling is not set up on the server yet (ANTHROPIC_API_KEY is missing).");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      system: PLACEMENT_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "विलेख:\n<deed>\n" +
            deedText.slice(0, MAX_DEED_CHARS) +
            "\n</deed>\n\n" + factsText + note,
        },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new BadRequestException(`Filling failed (HTTP ${res.status}).`);
  const body = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string };
  if (body.stop_reason === "max_tokens") throw new BadRequestException("The deed was too long to work through in one go.");
  const text = body.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new BadRequestException("Nothing came back.");

  const parsed = parseJsonArray(text);
  if (!parsed) throw new BadRequestException("Could not read the suggested changes.");

  const out: ProposedFill[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { role, find, replace, why } = item as Record<string, unknown>;
    if (role !== "seller" && role !== "buyer" && role !== "property") continue;
    if (typeof find !== "string" || typeof replace !== "string") continue;
    if (!find.trim() || find.length > 600 || replace.length > 600) continue;
    out.push({ role, find, replace, why: typeof why === "string" ? why.slice(0, 80) : "" });
    if (out.length >= 40) break;
  }
  return out;
}
