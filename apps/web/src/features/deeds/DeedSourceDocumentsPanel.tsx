import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, Check, Circle, FileUp, Loader2, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import {
  CHECKLIST,
  PROPERTY_KINDS,
  PROPERTY_KIND_LABEL,
  detectPropertyKind,
  type PropertyKind,
} from "./propertyKind";
import { useUiStore } from "../../stores/uiStore";
import { detectPartyTypes, type PartyType, type Side } from "./partySides";
import { useSearchParties, type PartyMeta } from "./useDeedDocuments";
import {
  useNameCheck,
  useProposeFill,
  useAddSourceDocument,
  useReadSourceDocument,
  useRemoveSourceDocument,
  useSourceDocuments,
  type DocumentRole,
  type ExtractedField,
  type FillProposal,
  type ProposedFill,
  type SourceDocumentItem,
} from "./useDeedSourceDocuments";

type T = (en: string, hi: string) => string;

/**
 * Card photos and scanned papers: the formats the reader can actually open.
 * Extensions as well as types, because Windows often gives a dragged PDF no
 * type at all.
 */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf";
const READABLE = /\.(jpe?g|png|webp|gif|pdf)$/i;

/** True for a photo or PDF the reader can open, judged by type or by name. */
function isReadable(file: File): boolean {
  return /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(file.type) || READABLE.test(file.name);
}

const ROLES: DocumentRole[] = ["seller", "buyer", "property"];

/** What an organisation brings instead of a person's card. */
const ORG_HINT: Record<Side, [string, string]> = {
  seller: [
    "Firm / company PAN, GST or registration, partnership deed or board resolution, and the signing person's Aadhaar. Leave empty and the seller already in the deed stays as it is.",
    "फर्म / कंपनी का पैन, GST या पंजीयन, पार्टनरशिप डीड या बोर्ड प्रस्ताव, और हस्ताक्षर करने वाले का आधार। न डालें तो विलेख में जो विक्रेता लिखा है वही रहेगा।",
  ],
  buyer: [
    "Firm / company PAN, GST or registration, partnership deed or board resolution, and the signing person's Aadhaar. Leave empty and the buyer already in the deed stays as it is.",
    "फर्म / कंपनी का पैन, GST या पंजीयन, पार्टनरशिप डीड या बोर्ड प्रस्ताव, और हस्ताक्षर करने वाले का आधार। न डालें तो विलेख में जो क्रेता लिखा है वही रहेगा।",
  ],
};

const ROLE_TEXT: Record<DocumentRole, { title: [string, string]; hint: [string, string] }> = {
  seller: {
    title: ["Seller's ID", "विक्रेता की ID"],
    hint: [
      "Aadhaar / PAN. Leave empty and the seller already in the deed stays as it is.",
      "आधार / पैन। न डालें तो विलेख में जो विक्रेता लिखा है वही रहेगा।",
    ],
  },
  buyer: {
    title: ["Buyer's ID", "क्रेता की ID"],
    hint: [
      "Aadhaar / PAN. Leave empty and the buyer already in the deed stays as it is.",
      "आधार / पैन। न डालें तो विलेख में जो क्रेता लिखा है वही रहेगा।",
    ],
  },
  property: {
    title: ["Property documents", "सम्पत्ति के दस्तावेज़"],
    hint: [
      "Khasra, B-1, rin pustika, old registry, map, payment details.",
      "खसरा, बी-1, ऋण पुस्तिका, पुरानी रजिस्ट्री, नक्शा, भुगतान का विवरण।",
    ],
  },
};

/** "…9012" -- enough to tell two people apart without printing the number. */
function lastFour(aadhaar: string | null): string | null {
  const d = (aadhaar ?? "").replace(/[^0-9]/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldRow({ field, done, onFill, t }: { field: ExtractedField; done: boolean; onFill: () => void; t: T }) {
  return (
    <div className="srcdoc-field">
      <div className="srcdoc-field-text">
        <div className="srcdoc-field-label">{field.label}</div>
        <div className="srcdoc-field-value">{field.value}</div>
      </div>
      <button type="button" className="srcdoc-fill" onClick={onFill}>
        {done ? t("Done", "गया") : t("Fill", "भरें")}
      </button>
    </div>
  );
}

/**
 * Choose someone already on file for this slot.
 *
 * It sits inside the seller and buyer slots, so where a person goes is never a
 * question: picked in the seller slot, they are a seller. On a colonizer's
 * deeds the sellers are the same people plot after plot, and this saves
 * uploading their cards every time.
 */
function SavedPersonPicker({
  picked,
  onPick,
  t,
}: {
  picked: PartyMeta[];
  onPick: (person: PartyMeta) => void;
  t: T;
}) {
  const [query, setQuery] = useState("");
  const results = useSearchParties(query);
  const pickedIds = new Set(picked.map((x) => x.id));
  const list = (results.data ?? []).filter((x) => !pickedIds.has(x.id));
  const searching = query.trim().length >= 2;

  return (
    <div className="srcdoc-picker">
      <input
        className="srcdoc-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Or pick someone saved: name, Aadhaar, PAN", "या सहेजे गए व्यक्ति को चुनें: नाम, आधार, पैन")}
      />
      {searching && !results.isLoading && list.length === 0 && (
        <p className="srcdoc-empty">{t("Nobody by that name yet.", "इस नाम से कोई नहीं मिला।")}</p>
      )}
      {searching &&
        list.map((person) => {
          const four = lastFour(person.aadhaarNumber);
          return (
            <button
              key={person.id}
              type="button"
              className="srcdoc-pick-person"
              onClick={() => {
                onPick(person);
                setQuery("");
              }}
            >
              <span className="srcdoc-pick-name">
                {person.name}
                {person.partyType === "company" && <span className="srcdoc-org-tag">{t("Organisation", "संस्था")}</span>}
              </span>
              <span className="srcdoc-pick-meta">
                {person.partyType === "company"
                  ? person.panNumber
                    ? t(`PAN ${person.panNumber}`, `पैन ${person.panNumber}`)
                    : t("no PAN on file", "पैन दर्ज नहीं")
                  : four
                    ? t(`Aadhaar …${four}`, `आधार …${four}`)
                    : t("no Aadhaar on file", "आधार दर्ज नहीं")}
                {" · "}
                {t("Add", "जोड़ें")}
              </span>
            </button>
          );
        })}
    </div>
  );
}

/**
 * One upload slot. Each slot owns its upload, so reading the buyer's card does
 * not show a spinner on the seller's slot, and each says plainly what happens
 * when it is left empty.
 */
function UploadSlot({
  deedId,
  role,
  docs,
  note,
  picked,
  onPick,
  onUnpick,
  partyType,
  onPartyType,
  t,
}: {
  deedId: string;
  role: DocumentRole;
  docs: SourceDocumentItem[];
  /** Extra line for this deed's situation, e.g. farmland naming rules. */
  note?: string;
  /** Saved people placed in this slot; only the seller and buyer slots take them. */
  picked?: PartyMeta[];
  onPick?: (person: PartyMeta) => void;
  onUnpick?: (id: string) => void;
  /** Seller and buyer only: whether this side is a person or an organisation. */
  partyType?: PartyType;
  onPartyType?: (type: PartyType) => void;
  t: T;
}) {
  const add = useAddSourceDocument(deedId);
  const reread = useReadSourceDocument(deedId);
  const remove = useRemoveSourceDocument(deedId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  const text = ROLE_TEXT[role];

  /**
   * The picker already limits what can be chosen, but a drop brings whatever
   * was dragged. Anything that is not a photo or PDF is named and left out,
   * rather than stored as a file nobody can read.
   */
  function upload(files: FileList | null) {
    if (!files) return;
    const all = Array.from(files);
    setRefused(all.filter((f) => !isReadable(f)).map((f) => f.name));
    for (const file of all.filter(isReadable)) add.mutate({ file, role });
  }

  return (
    <section className={"srcdoc-slot srcdoc-slot--" + role}>
      <div className="srcdoc-slot-head">
        <span className="srcdoc-slot-title">
          {partyType === "organisation" && role !== "property"
            ? role === "seller"
              ? t("Seller organisation's papers", "विक्रेता संस्था के कागज़")
              : t("Buyer organisation's papers", "क्रेता संस्था के कागज़")
            : t(...text.title)}
        </span>
        {(docs.length > 0 || (picked?.length ?? 0) > 0) && <Check className="size-3.5 srcdoc-slot-ok" aria-hidden />}
      </div>
      {partyType && onPartyType && (
        <div className="srcdoc-type" role="radiogroup" aria-label={t("Person or organisation", "व्यक्ति या संस्था")}>
          {(["individual", "organisation"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={partyType === type}
              className={"srcdoc-type-btn" + (partyType === type ? " is-on" : "")}
              onClick={() => onPartyType(type)}
            >
              {type === "individual" ? t("Person", "व्यक्ति") : t("Organisation", "संस्था")}
            </button>
          ))}
        </div>
      )}
      <p className="srcdoc-slot-hint">
        {t(...(partyType === "organisation" && role !== "property" ? ORG_HINT[role] : text.hint))}
      </p>
      {note && <p className="srcdoc-slot-note">{note}</p>}

      <div
        className={"srcdoc-drop srcdoc-drop--small" + (dragging ? " is-dragging" : "")}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e: DragEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
      >
        <FileUp className="size-4 opacity-70" aria-hidden />
        <button type="button" className="srcdoc-pick" onClick={() => fileRef.current?.click()}>
          {t("Choose", "फ़ाइल चुनें")}
        </button>
        <span className="srcdoc-drop-hint">{t("or drop here · photo or PDF", "या यहाँ छोड़ें · फ़ोटो या PDF")}</span>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {add.isPending && (
        <p className="srcdoc-busy">
          <Loader2 className="size-4 srcdoc-spin" aria-hidden />
          {t("Reading…", "पढ़ा जा रहा है…")}
        </p>
      )}
      {add.isError && <p className="srcdoc-error">{add.error.message}</p>}
      {refused.length > 0 && (
        <p className="srcdoc-error">
          {t("Not added — only photos (JPG, PNG) and PDFs: ", "नहीं जोड़ी गई — सिर्फ़ फ़ोटो (JPG, PNG) और PDF चलते हैं: ")}
          {refused.join(", ")}
        </p>
      )}

      {docs.length > 0 && (
        <ul className="srcdoc-files">
          {docs.map((d) => (
            <li key={d.id} className="srcdoc-file">
              <span className="srcdoc-file-name" title={d.fileName}>
                {d.fileName}
              </span>
              <span className="srcdoc-file-size">{prettySize(d.size)}</span>
              {d.extractError && (
                <button
                  type="button"
                  className="srcdoc-icon"
                  title={d.extractError}
                  onClick={() => reread.mutate(d.id)}
                  disabled={reread.isPending}
                  aria-label={t("Read again", "फिर से पढ़ें")}
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                </button>
              )}
              <button type="button" className="srcdoc-icon" onClick={() => remove.mutate(d.id)} aria-label={t("Remove", "हटाएँ")}>
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && picked.length > 0 && (
        <ul className="srcdoc-files">
          {picked.map((person) => (
            <li key={person.id} className="srcdoc-file srcdoc-file--person">
              <UserRound className="size-3.5 opacity-70" aria-hidden />
              <span className="srcdoc-file-name" title={person.name}>
                {person.name}
              </span>
              <button
                type="button"
                className="srcdoc-icon"
                onClick={() => onUnpick?.(person.id)}
                aria-label={t("Remove", "हटाएँ")}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {onPick && <SavedPersonPicker picked={picked ?? []} onPick={onPick} t={t} />}
    </section>
  );
}

/**
 * The paperwork behind a deed, beside the deed itself.
 *
 * The seller's ID, the buyer's ID and the property papers each go in their own
 * slot, so filling the deed follows what the drafter said about each paper
 * instead of guessing from the name printed on it. A slot left empty means that
 * part of the deed stays exactly as it is -- a copied deed keeps its seller.
 *
 * Nothing reaches the deed on its own: every change is listed first and applied
 * only when someone agrees to it.
 */
export function DeedSourceDocumentsPanel({
  deedId,
  title,
  content,
  onInsert,
  onApplyFills,
}: {
  deedId: string;
  /** The deed as it stands, to tell what kind of property it sells. */
  title: string;
  content: string;
  /** Drop a value into the deed at the cursor. Returns false if it could not. */
  onInsert: (value: string) => boolean;
  /**
   * Apply the agreed changes to the deed as it stands now. Returns how many
   * landed; the rest no longer matched because the text changed meanwhile.
   */
  onApplyFills: (fills: ProposedFill[]) => { applied: number; missed: number };
}) {
  const lang = useUiStore((s) => s.lang);
  const hi = lang === "hi";
  const t: T = (en, hindi) => (hi ? hindi : en);

  const docs = useSourceDocuments(deedId);
  const rows: SourceDocumentItem[] = docs.data ?? [];
  const byRole: Record<DocumentRole, SourceDocumentItem[]> = { seller: [], buyer: [], property: [] };
  for (const d of rows) byRole[d.role].push(d);
  const fieldsByRole: Record<DocumentRole, ExtractedField[]> = {
    seller: byRole.seller.flatMap((d) => d.extracted ?? []),
    buyer: byRole.buyer.flatMap((d) => d.extracted ?? []),
    property: byRole.property.flatMap((d) => d.extracted ?? []),
  };
  const anyFields = ROLES.some((r) => fieldsByRole[r].length > 0);
  const propertyLabels = new Set(fieldsByRole.property.map((f) => f.label));

  /**
   * What the deed sells. Detected from its words; the drafter can override it,
   * and that choice is remembered for this deed on this device -- a per-viewer
   * convenience, not something the deed itself needs to carry.
   */
  const kindKey = `nsk-deed-kind:${deedId}`;
  const [kindOverride, setKindOverride] = useState<PropertyKind | null>(() => {
    try {
      const v = localStorage.getItem(kindKey);
      return v && (PROPERTY_KINDS as string[]).includes(v) ? (v as PropertyKind) : null;
    } catch {
      return null;
    }
  });
  const detectedKind = useMemo(() => detectPropertyKind(title, content), [title, content]);
  const kind = kindOverride ?? detectedKind;
  function chooseKind(value: string) {
    const next = value === "" ? null : (value as PropertyKind);
    setKindOverride(next);
    try {
      if (next) localStorage.setItem(kindKey, next);
      else localStorage.removeItem(kindKey);
    } catch {
      /* storage unavailable: the choice just lasts for this visit */
    }
  }

  /**
   * Person or organisation, per side. Detected from the deed's seller and buyer
   * entries; a choice made here wins and is remembered for this deed on this
   * device, like the property kind.
   */
  const partyKey = `nsk-deed-party:${deedId}`;
  const [partyOverride, setPartyOverride] = useState<Partial<Record<Side, PartyType>>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(partyKey) ?? "{}") as Record<string, unknown>;
      const ok = (x: unknown): x is PartyType => x === "individual" || x === "organisation";
      return { ...(ok(v.seller) ? { seller: v.seller } : {}), ...(ok(v.buyer) ? { buyer: v.buyer } : {}) };
    } catch {
      return {};
    }
  });
  const detectedParties = useMemo(() => detectPartyTypes(content), [content]);
  const partyTypes: Record<Side, PartyType> = {
    seller: partyOverride.seller ?? detectedParties.seller,
    buyer: partyOverride.buyer ?? detectedParties.buyer,
  };
  function choosePartyType(side: Side, type: PartyType) {
    setPartyOverride((prev) => {
      const next = { ...prev, [side]: type };
      try {
        localStorage.setItem(partyKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: the choice just lasts for this visit */
      }
      return next;
    });
  }

  /**
   * Saved people placed in the seller and buyer slots. Kept for this visit
   * only: they are a choice for the next "fill", not part of the deed.
   */
  const [picked, setPicked] = useState<Record<"seller" | "buyer", PartyMeta[]>>({ seller: [], buyer: [] });
  const pickedIds = { seller: picked.seller.map((x) => x.id), buyer: picked.buyer.map((x) => x.id) };
  function pick(role: "seller" | "buyer", person: PartyMeta) {
    if (person.partyType === "company" && partyTypes[role] !== "organisation") choosePartyType(role, "organisation");
    setPicked((prev) => {
      // One person, one side: picking someone as buyer takes them off seller.
      const other = role === "seller" ? "buyer" : "seller";
      return {
        ...prev,
        [other]: prev[other].filter((x) => x.id !== person.id),
        [role]: prev[role].some((x) => x.id === person.id) ? prev[role] : [...prev[role], person],
      };
    });
  }
  function unpick(role: "seller" | "buyer", id: string) {
    setPicked((prev) => ({ ...prev, [role]: prev[role].filter((x) => x.id !== id) }));
  }
  const hasFor = (role: DocumentRole) =>
    byRole[role].length > 0 || (role !== "property" && picked[role].length > 0);

  const farmland = kind === "agriculture";
  const nameCheck = useNameCheck(deedId, farmland, content, pickedIds.seller);
  const nameWarnings = farmland ? (nameCheck.data?.warnings ?? []) : [];

  const [justInserted, setJustInserted] = useState<string | null>(null);
  const [needsCursor, setNeedsCursor] = useState(false);
  const propose = useProposeFill(deedId);
  const [proposal, setProposal] = useState<FillProposal | null>(null);
  /** Indexes into proposal.fills the person has un-ticked. */
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [applyResult, setApplyResult] = useState<{ applied: number; missed: number } | null>(null);

  function askWhereItGoes() {
    setApplyResult(null);
    propose.mutate({ kind, people: pickedIds, partyTypes }, {
      onSuccess: (p) => {
        setProposal(p);
        setRejected(new Set());
      },
    });
  }

  function applyProposal() {
    if (!proposal) return;
    const chosen = proposal.fills.filter((_, i) => !rejected.has(i));
    setApplyResult(onApplyFills(chosen));
    setProposal(null);
  }

  function insert(field: ExtractedField) {
    const ok = onInsert(field.value);
    setNeedsCursor(!ok);
    if (ok) {
      setJustInserted(field.label + field.value);
      window.setTimeout(() => setJustInserted(null), 1200);
    }
  }

  const untouched = ROLES.filter((r) => !hasFor(r));
  const canFill = anyFields || picked.seller.length > 0 || picked.buyer.length > 0;

  return (
    <aside className="srcdoc">
      <div className="srcdoc-head">
        <h4 className="srcdoc-title">{t("Documents", "दस्तावेज़")}</h4>
      </div>

      <div className="srcdoc-kind">
        <label className="srcdoc-kind-row">
          <span className="srcdoc-kind-label">{t("This deed is for", "यह विलेख है")}</span>
          <select className="srcdoc-kind-select" value={kindOverride ?? ""} onChange={(e) => chooseKind(e.target.value)}>
            <option value="">
              {detectedKind
                ? t(`${PROPERTY_KIND_LABEL[detectedKind].en} (detected)`, `${PROPERTY_KIND_LABEL[detectedKind].hi} (अपने-आप पहचाना)`)
                : t("Not detected — choose", "पहचान नहीं हुई — चुनें")}
            </option>
            {PROPERTY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(PROPERTY_KIND_LABEL[k].en, PROPERTY_KIND_LABEL[k].hi)}
              </option>
            ))}
          </select>
        </label>
        {kind && (
          <ul className="srcdoc-checklist">
            {CHECKLIST[kind].map((item) => {
              const have = item.role ? hasFor(item.role) : (item.found ?? []).some((l) => propertyLabels.has(l));
              return (
                <li key={item.en} className={"srcdoc-check" + (have ? " is-have" : "")}>
                  {have ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
                  <span>
                    {item.role && partyTypes[item.role] === "organisation"
                      ? item.role === "seller"
                        ? t("Seller organisation's papers (PAN, authority)", "विक्रेता संस्था के कागज़ (पैन, अधिकार पत्र)")
                        : t("Buyer organisation's papers (PAN, authority)", "क्रेता संस्था के कागज़ (पैन, अधिकार पत्र)")
                      : t(item.en, item.hi)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {ROLES.map((role) => (
        <UploadSlot
          key={role}
          deedId={deedId}
          role={role}
          docs={byRole[role]}
          picked={role === "property" ? undefined : picked[role]}
          onPick={role === "property" ? undefined : (person) => pick(role, person)}
          onUnpick={role === "property" ? undefined : (id) => unpick(role, id)}
          partyType={role === "property" ? undefined : partyTypes[role]}
          onPartyType={role === "property" ? undefined : (type) => choosePartyType(role, type)}
          note={
            farmland && role === "seller"
              ? t(
                  "Farmland: the seller's name is written as the khasra has it. The ID gives only the Aadhaar / PAN number and address.",
                  "कृषि भूमि: विक्रेता का नाम खसरे के अनुसार लिखा जाएगा। ID से केवल आधार / पैन नंबर और पता लिया जाएगा।",
                )
              : undefined
          }
          t={t}
        />
      ))}

      {nameWarnings.length > 0 && (
        <div className="srcdoc-warnings" role="alert">
          <div className="srcdoc-warnings-title">
            <AlertTriangle className="size-4" aria-hidden />
            {t("Name check: ID and khasra", "नाम की जाँच: ID और खसरा")}
          </div>
          {nameWarnings.map((w, i) => (
            <p key={i} className={"srcdoc-warning srcdoc-warning--" + w.level}>
              {w.message}
            </p>
          ))}
        </div>
      )}

      {canFill && !proposal && (
        <>
          <button type="button" className="srcdoc-auto" onClick={askWhereItGoes} disabled={propose.isPending}>
            {propose.isPending ? (
              <>
                <Loader2 className="size-4 srcdoc-spin" aria-hidden />
                {t("Working out where each goes…", "देखा जा रहा है कि क्या कहाँ भरना है…")}
              </>
            ) : (
              t("Fill the deed from these", "विलेख में अपने-आप भरें")
            )}
          </button>
          {untouched.length > 0 && (
            <p className="srcdoc-keep">
              {t("Stays as it is: ", "जैसा है वैसा रहेगा: ")}
              {untouched.map((r) => t(...ROLE_TEXT[r].title)).join(", ")}
            </p>
          )}
        </>
      )}
      {propose.isError && <p className="srcdoc-error">{propose.error.message}</p>}
      {applyResult && (
        <p className="srcdoc-done">
          {t(`${applyResult.applied} filled.`, `${applyResult.applied} जगह भरा गया।`)}
          {applyResult.missed > 0 &&
            t(
              ` ${applyResult.missed} skipped — that text changed in the meantime.`,
              ` ${applyResult.missed} छोड़े गए — वह हिस्सा इस बीच बदल चुका था।`,
            )}
        </p>
      )}

      {proposal && (
        <div className="srcdoc-review">
          <h5 className="srcdoc-fields-title">{t("Check before filling", "भरने से पहले देख लें")}</h5>
          {proposal.warnings.map((w, i) => (
            <p key={"w" + i} className="srcdoc-warning srcdoc-warning--error srcdoc-review-warning" role="alert">
              <AlertTriangle className="size-3.5" aria-hidden /> {w}
            </p>
          ))}
          {proposal.fills.length === 0 && (
            <p className="srcdoc-empty">{t("Nothing could be placed with certainty.", "कुछ भी पक्के तौर पर कहीं नहीं बैठा।")}</p>
          )}
          {proposal.fills.map((f, i) => {
            const on = !rejected.has(i);
            return (
              <label key={i} className={"srcdoc-change" + (on ? "" : " is-off")}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setRejected((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
                <span className="srcdoc-change-body">
                  <span className="srcdoc-change-why">
                    <span className={"srcdoc-role srcdoc-role--" + f.role}>{t(...ROLE_TEXT[f.role].title)}</span> {f.why}
                  </span>
                  <span className="srcdoc-change-old">{f.find}</span>
                  <span className="srcdoc-change-new">{f.replace}</span>
                </span>
              </label>
            );
          })}
          {proposal.skipped.map((k, i) => (
            <p key={"s" + i} className="srcdoc-empty">
              {k.why} — {k.reason}
            </p>
          ))}
          <div className="srcdoc-review-actions">
            <button type="button" className="srcdoc-apply" onClick={applyProposal} disabled={proposal.fills.length === rejected.size}>
              {t("Apply", "लगाएँ")}
            </button>
            <button type="button" className="srcdoc-cancel" onClick={() => setProposal(null)}>
              {t("Cancel", "रहने दें")}
            </button>
          </div>
        </div>
      )}

      {anyFields && (
        <div className="srcdoc-fields">
          <h5 className="srcdoc-fields-title">{t("What was found", "निकाली गई जानकारी")}</h5>
          {needsCursor && (
            <p className="srcdoc-error">
              {t("Click in the deed where it should go, then press भरें.", "पहले विलेख में वहाँ क्लिक करें जहाँ भरना है, फिर भरें दबाएँ।")}
            </p>
          )}
          {ROLES.map((role) =>
            fieldsByRole[role].length === 0 ? null : (
              <div key={role} className="srcdoc-group">
                <div className="srcdoc-group-name">{t(...ROLE_TEXT[role].title)}</div>
                {fieldsByRole[role].map((f, i) => (
                  <FieldRow key={role + i + f.label} field={f} done={justInserted === f.label + f.value} onFill={() => insert(f)} t={t} />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </aside>
  );
}
