import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type RefObject } from "react";
import { Camera, Eye, FileUp, Info, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useSampleDeed } from "./useSampleDeeds";
import {
  useAddDeedParty,
  useAddNaxa,
  useDeedNaxa,
  useDeedParties,
  useFileOpener,
  useRemoveDeedParty,
  useRemoveNaxa,
  useSearchParties,
  type DeedPartyItem,
  type NaxaMeta,
  type PartyMeta,
  type PartyRole,
  type PartyType,
} from "./useDeedDocuments";

type T = (en: string, hi: string) => string;

/** Files accepted for a property map (naxa): images, PDF, and Word documents. */
const NAXA_ACCEPT =
  "image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function maskAadhaar(a: string | null): string {
  const d = (a || "").replace(/[^0-9]/g, "");
  if (d.length < 4) return d;
  return d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8, 12);
}

/** Group a 12-digit Aadhaar as "1234 5678 9012" (unmasked, for the details view). */
function formatAadhaar(a: string | null): string {
  const d = (a || "").replace(/[^0-9]/g, "");
  if (d.length !== 12) return a || "";
  return d.slice(0, 4) + " " + d.slice(4, 8) + " " + d.slice(8, 12);
}

/* ------------------------------------------------------------------ *
 * Client-side OCR auto-fill for Aadhaar / PAN cards.
 * Tesseract.js is loaded lazily from a CDN the first time a card image
 * is chosen, so there is no npm dependency / lockfile change and the
 * bundle stays small. Everything is best-effort: the number is pulled
 * with a strict regex (reliable); the name is a rough guess. Extracted
 * values only fill EMPTY fields, and the user is always asked to verify.
 * ------------------------------------------------------------------ */

let tesseractPromise: Promise<unknown> | null = null;

/** Lazy-load Tesseract.js from CDN once; resolves to the global Tesseract. */
function loadTesseract(): Promise<{ recognize: (img: File, lang: string) => Promise<{ data: { text: string } }> }> {
  const w = window as unknown as { Tesseract?: unknown };
  if (w.Tesseract) return Promise.resolve(w.Tesseract as never);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.async = true;
      s.onload = () => resolve((window as unknown as { Tesseract: unknown }).Tesseract);
      s.onerror = () => reject(new Error("OCR load failed"));
      document.head.appendChild(s);
    });
  }
  return tesseractPromise as never;
}

/** OCR an image file to plain text (best-effort; images only, not PDFs). */
async function ocrImageText(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return "";
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, "eng");
  return data?.text || "";
}

/** Extract a 12-digit Aadhaar number from OCR text (rejects a 16-digit VID). */
function findAadhaar(text: string): string | undefined {
  const m = text.match(/(?<!\d)(\d{4})\s?(\d{4})\s?(\d{4})(?!\s?\d)/);
  if (!m) return undefined;
  const digits = (m[1] ?? "") + (m[2] ?? "") + (m[3] ?? "");
  return digits.length === 12 ? digits : undefined;
}

/** Extract a PAN (ABCDE1234F) from OCR text. */
function findPan(text: string): string | undefined {
  const m = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
  return m ? m[0].toUpperCase() : undefined;
}

/** Best-effort English-name guess from an Aadhaar/PAN OCR text. */
function guessName(text: string): string | undefined {
  const bad =
    /aadhaar|government|india|male|female|dob|date of birth|year of birth|income tax|department|permanent|account|number|govt|father|signature|vid/i;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line || /\d/.test(line) || bad.test(line)) continue;
    const letters = line.replace(/[^A-Za-z ]/g, "").trim();
    const words = letters.split(/\s+/).filter(Boolean);
    if (letters.length >= 4 && words.length >= 1 && words.length <= 5) {
      return words.join(" ");
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Camera-capture auto-crop (edge detection).
 * When a photo is TAKEN with the camera it usually has a background;
 * jscanify (built on OpenCV.js) finds the document's edges and crops/
 * warps just the card out. Both libs load lazily from CDN, and only
 * on the first camera capture — regular "choose file" uploads never
 * pay this cost. Fully best-effort: any failure falls back to the
 * original photo so the upload + OCR still work.
 * ------------------------------------------------------------------ */

let jscanifyPromise: Promise<unknown> | null = null;

function loadJscanify(): Promise<new () => { loadOpenCV: (cb: () => void) => void; extractPaper: (img: HTMLImageElement | HTMLCanvasElement, w: number, h: number) => HTMLCanvasElement }> {
  const w = window as unknown as { jscanify?: unknown };
  if (w.jscanify) return Promise.resolve(w.jscanify as never);
  if (!jscanifyPromise) {
    jscanifyPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jscanify@1.3.0/src/jscanify.min.js";
      s.async = true;
      s.onload = () => resolve((window as unknown as { jscanify: unknown }).jscanify);
      s.onerror = () => reject(new Error("jscanify load failed"));
      document.head.appendChild(s);
    });
  }
  return jscanifyPromise as never;
}

/** Decode a File into an HTMLImageElement. */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

/** Auto-detect the document edges in a photo and return a cropped image.
 * Returns the ORIGINAL file unchanged on any failure (or for non-images). */
async function autoCropDocument(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const JscanifyCtor = await loadJscanify();
    const scanner = new JscanifyCtor();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("opencv timeout")), 20000);
      try {
        scanner.loadOpenCV(() => {
          clearTimeout(t);
          resolve();
        });
      } catch (e) {
        clearTimeout(t);
        reject(e as Error);
      }
    });
    const img = await fileToImage(file);
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return file;
    const resultW = Math.min(1400, natW);
    const resultH = Math.round(resultW * (natH / natW));
    const out = scanner.extractPaper(img, resultW, resultH);
    const blob: Blob | null = await new Promise((res) => out.toBlob((b: Blob | null) => res(b), "image/jpeg", 0.92));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-scan.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

interface PartyHint {
  name: string;
  aadhaarNumber?: string;
  panNumber?: string;
  partyType?: PartyType;
}

/**
 * Pull the leading seller/buyer name (+ Aadhaar/PAN if embedded) out of a deed's
 * drafted text, e.g. "विक्रेता : मैसर्स इन्‍द्रा क्रियेटर ... (पेन नं. AADFI9247E)" or
 * "क्रेता : श्रीमती सत्‍यवती सिंह पत्‍नी ... (आ.नं. 7526 8181 4484)". Best-effort —
 * only picks up the primary/first party; multi-party deeds still need the rest
 * added by hand. Returns null if the deed's text doesn't use this convention.
 */
function extractPartyHint(content: string, role: PartyRole): PartyHint | null {
  const marker = role === "seller" ? /विक्रेता\s*[:：]/ : /क्रेता\s*[:：]/;
  const m = marker.exec(content);
  if (!m) return null;
  const rest = content.slice(m.index + m[0].length);
  const stopMarker = role === "seller" ? /क्रेता\s*[:：]/ : /\n\s*1\s*\./;
  const sm = stopMarker.exec(rest);
  const block = rest.slice(0, sm ? sm.index : Math.min(rest.length, 400));

  const parenIdx = block.indexOf("(");
  const newlineIdx = block.indexOf("\n");
  const nameEnd = parenIdx >= 0 ? parenIdx : newlineIdx >= 0 ? newlineIdx : block.length;
  const name = (block
    .slice(0, nameEnd)
    .split(/\s+(?:पुत्र|पुत्री|पत्नी|पत्‍नी|पति|विधवा)\s+/)[0] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[:\-–,।]+|[:\-–,।]+$/g, "")
    .trim();
  if (!name) return null;

  let aadhaarNumber: string | undefined;
  let panNumber: string | undefined;
  if (parenIdx >= 0) {
    const closeIdx = block.indexOf(")", parenIdx);
    const parenText = block.slice(parenIdx, closeIdx >= 0 ? closeIdx + 1 : undefined);
    const panMatch = parenText.match(/[A-Z]{5}[0-9]{4}[A-Z]/i);
    if (panMatch) {
      panNumber = panMatch[0].toUpperCase();
    } else {
      const digits = parenText.replace(/[^0-9]/g, "");
      if (digits.length === 12) aadhaarNumber = digits;
    }
  }

  const partyType: PartyType = /मैसर्स|फर्म|कम्‍पनी|कंपनी|प्रा\.?\s*लि|Pvt\.?\s*Ltd|LLP/i.test(name)
    ? "company"
    : "individual";

  return { name, aadhaarNumber, panNumber, partyType };
}

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
  background: "var(--surface, rgba(255,255,255,0.02))",
};

const FILE_LABEL: CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
  marginBottom: 2,
};

const CAM_BTN: CSSProperties = {
  marginTop: 4,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  opacity: 0.8,
  background: "none",
  border: "1px solid var(--border, #333)",
  borderRadius: 6,
  padding: "2px 6px",
  cursor: "pointer",
  color: "inherit",
  width: "fit-content",
};

type OcrSlot = "aadhaar" | "aadhaarBack" | "pan";

/** One document slot: a "Choose file" input (works on desktop) plus a
 * "Take photo" button that opens the camera on mobile. Both feed the same
 * OCR pipeline; the camera path additionally auto-crops the document. */
function DocSlot({
  label,
  slot,
  ocrBusy,
  T,
  fileInputRef,
  camInputRef,
  onFile,
  onCamera,
}: {
  label: string;
  slot: OcrSlot;
  ocrBusy: OcrSlot | null;
  T: T;
  fileInputRef: RefObject<HTMLInputElement | null>;
  camInputRef: RefObject<HTMLInputElement | null>;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onCamera: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 170px" }}>
      <span style={FILE_LABEL}>
        {label}
        {ocrBusy === slot ? T(" — reading…", " — पढ़ रहे…") : ""}
      </span>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onFile}
        style={{ fontSize: 13 }}
      />
      <button type="button" style={CAM_BTN} onClick={() => camInputRef.current?.click()}>
        <Camera size={12} /> {T("Take photo", "फोटो लें")}
      </button>
      <input
        ref={camInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCamera}
        style={{ display: "none" }}
      />
    </div>
  );
}

/** Inline documents panel shown under a deed row: sellers'/buyers' Aadhaar (reused across deeds) + property map, plus a search over saved people to see who's already added. */
export function DeedDocumentsPanel({ deedId }: { deedId: string }) {
  const lang = useUiStore((s) => s.lang);
  const T: T = (en, hi) => (lang === "hi" ? hi : en);

  const parties = useDeedParties(deedId);
  const naxa = useDeedNaxa(deedId);
  const openFile = useFileOpener();
  const add = useAddDeedParty(deedId);
  const deed = useSampleDeed(deedId);

  const sellerHint = useMemo(
    () => (deed.data?.content ? extractPartyHint(deed.data.content, "seller") : null),
    [deed.data?.content],
  );
  const buyerHint = useMemo(
    () => (deed.data?.content ? extractPartyHint(deed.data.content, "buyer") : null),
    [deed.data?.content],
  );

  const items = parties.data ?? [];
  const buyers = items.filter((p) => p.role === "buyer");
  const sellers = items.filter((p) => p.role === "seller");

  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const results = useSearchParties(q);

  async function view(path: string) {
    const url = await openFile(path);
    window.open(url, "_blank");
  }

  function addExisting(p: PartyMeta, role: PartyRole) {
    setErr(null);
    add.mutate({ role, partyId: p.id }, { onError: (e) => setErr(e.message) });
  }

  return (
    <div style={{ padding: "14px 8px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ background: "var(--surface-2, rgba(255,255,255,0.03))", borderRadius: 10, padding: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={15} style={{ opacity: 0.6 }} />
          <input
            className="district-input"
            style={{ flex: 1 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={T("Search saved people — already added?", "सेव लोगों में खोजें — पहले से जुड़ा?")}
          />
        </label>
        {q.trim().length >= 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {(results.data ?? []).map((p) => {
              const on = items.find((it) => it.party.id === p.id);
              return (
                <div key={p.id} style={ROW}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ opacity: 0.6, fontSize: 13 }}>{maskAadhaar(p.aadhaarNumber)}</span>
                  {on ? (
                    <span style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
                      {T("Already added — ", "पहले से जुड़ा — ") +
                        (on.role === "buyer" ? T("buyer", "खरीददार") : T("seller", "विक्रेता"))}
                    </span>
                  ) : (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button type="button" className="doc-btn" disabled={add.isPending} onClick={() => addExisting(p, "seller")}>
                        + {T("Seller", "विक्रेता")}
                      </button>
                      <button type="button" className="doc-btn" disabled={add.isPending} onClick={() => addExisting(p, "buyer")}>
                        + {T("Buyer", "खरीददार")}
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            {results.isFetched && (results.data?.length ?? 0) === 0 && (
              <div style={{ fontSize: 13, opacity: 0.6 }}>{T("No saved person found.", "कोई सेव व्यक्ति नहीं मिला।")}</div>
            )}
          </div>
        )}
        {err && (
          <p className="modal-error" style={{ marginTop: 8 }}>
            {err}
          </p>
        )}
      </div>

      <PartyGroup role="seller" title={T("Sellers", "विक्रेता")} items={sellers} deedId={deedId} onView={view} T={T} hint={sellerHint} />
      <PartyGroup role="buyer" title={T("Buyers", "खरीददार")} items={buyers} deedId={deedId} onView={view} T={T} hint={buyerHint} />
      <NaxaGroup deedId={deedId} items={naxa.data ?? []} onView={view} T={T} />
    </div>
  );
}

function PartyGroup({
  role,
  title,
  items,
  deedId,
  onView,
  T,
  hint,
}: {
  role: PartyRole;
  title: string;
  items: DeedPartyItem[];
  deedId: string;
  onView: (path: string) => void;
  T: T;
  hint?: PartyHint | null;
}) {
  const add = useAddDeedParty(deedId);
  const remove = useRemoveDeedParty(deedId);
  const [expanded, setExpanded] = useState(false);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [partyType, setPartyType] = useState<PartyType>("individual");
  const [aadhaar, setAadhaar] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [aadhaarBack, setAadhaarBack] = useState<File | null>(null);
  const [pan, setPan] = useState("");
  const [panFile, setPanFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);
  const [ocrBusy, setOcrBusy] = useState<null | OcrSlot>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aadhaarBackFileRef = useRef<HTMLInputElement>(null);
  const panFileRef = useRef<HTMLInputElement>(null);
  const frontCamRef = useRef<HTMLInputElement>(null);
  const backCamRef = useRef<HTMLInputElement>(null);
  const panCamRef = useRef<HTMLInputElement>(null);
  const appliedHint = useRef(false);

  useEffect(() => {
    if (!hint || appliedHint.current) return;
    appliedHint.current = true;
    let filled = false;
    setName((cur) => {
      if (cur || !hint.name) return cur;
      filled = true;
      return hint.name;
    });
    if (hint.partyType) setPartyType(hint.partyType);
    if (hint.aadhaarNumber) {
      setAadhaar((cur) => {
        if (cur) return cur;
        filled = true;
        return hint.aadhaarNumber as string;
      });
    }
    if (hint.panNumber) {
      setPan((cur) => {
        if (cur) return cur;
        filled = true;
        return hint.panNumber as string;
      });
    }
    if (filled) {
      setAutoFilled(true);
      setExpanded(true);
    }
  }, [hint]);

  /** Run OCR on an image and fill the empty fields relevant to the slot. */
  async function runOcrFill(f: File, slot: OcrSlot) {
    if (!f.type.startsWith("image/")) return;
    const text = await ocrImageText(f);
    let filled = false;
    if (slot === "aadhaar" || slot === "aadhaarBack") {
      const num = findAadhaar(text);
      if (num && !aadhaar) {
        setAadhaar(num);
        filled = true;
      }
    }
    if (slot === "pan") {
      const p = findPan(text);
      if (p && !pan) {
        setPan(p);
        filled = true;
      }
    }
    if (slot === "aadhaar" || slot === "pan") {
      const nm = guessName(text);
      if (nm && !name) {
        setName(nm);
        filled = true;
      }
    }
    if (filled) setAutoFilled(true);
  }

  /** A file was chosen via "Choose file" — store it as-is and OCR it. */
  async function onFilePick(e: ChangeEvent<HTMLInputElement>, slot: OcrSlot, setF: (f: File | null) => void) {
    const f = e.target.files?.[0] ?? null;
    setF(f);
    if (!f || !f.type.startsWith("image/")) return;
    setOcrBusy(slot);
    try {
      await runOcrFill(f, slot);
    } catch {
      /* OCR is best-effort; ignore failures and let the user type. */
    } finally {
      setOcrBusy(null);
    }
  }

  /** A photo was taken with the camera — auto-crop the document, then store + OCR. */
  async function onCameraPick(e: ChangeEvent<HTMLInputElement>, slot: OcrSlot, setF: (f: File | null) => void) {
    const raw = e.target.files?.[0] ?? null;
    if (!raw) return;
    setOcrBusy(slot);
    try {
      const cropped = await autoCropDocument(raw);
      setF(cropped);
      await runOcrFill(cropped, slot);
    } catch {
      setF(raw);
    } finally {
      setOcrBusy(null);
    }
  }

  function reset() {
    setName("");
    setPartyType("individual");
    setAadhaar("");
    setFile(null);
    setAadhaarBack(null);
    setPan("");
    setPanFile(null);
    setErr(null);
    setAutoFilled(false);
    setOcrBusy(null);
    setExpanded(false);
    for (const r of [fileRef, aadhaarBackFileRef, panFileRef, frontCamRef, backCamRef, panCamRef]) {
      if (r.current) r.current.value = "";
    }
  }

  function addNew() {
    setErr(null);
    const digits = aadhaar.replace(/[^0-9]/g, "");
    const panTrimmed = pan.trim().toUpperCase();
    if (!name.trim()) {
      setErr(T("Enter the person's name.", "व्यक्ति का नाम डालें।"));
      return;
    }
    if (aadhaar && digits.length !== 12) {
      setErr(T("Enter a valid 12-digit Aadhaar number.", "सही 12 अंकों का आधार नंबर डालें।"));
      return;
    }
    if (pan && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(panTrimmed)) {
      setErr(T("Enter a valid 10-character PAN number.", "सही 10 अक्षर का पेन नंबर डालें।"));
      return;
    }
    if (!digits && !panTrimmed) {
      setErr(T("Enter an Aadhaar number or PAN number.", "आधार नंबर या पेन नंबर डालें।"));
      return;
    }
    if (digits && !file) {
      setErr(T("Choose the Aadhaar card image/PDF (front).", "आधार कार्ड की इमेज/PDF चुनें (आगे)।"));
      return;
    }
    if (panTrimmed && !panFile) {
      setErr(T("Choose the PAN card image/PDF.", "पेन कार्ड की इमेज/PDF चुनें।"));
      return;
    }
    add.mutate(
      {
        role,
        name: name.trim(),
        partyType,
        aadhaarNumber: digits || undefined,
        panNumber: panTrimmed || undefined,
        file: file || undefined,
        aadhaarBackFile: aadhaarBack || undefined,
        panFile: panFile || undefined,
      },
      { onSuccess: reset, onError: (e) => setErr(e.message) },
    );
  }

  return (
    <section style={{ borderTop: "1px solid var(--border, #333)", paddingTop: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>
        {title} <span style={{ opacity: 0.55 }}>({items.length})</span>
      </h4>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {items.map((it) => {
            const removing = remove.isPending && remove.variables === it.linkId;
            const p = it.party;
            const open = detailsFor === it.linkId;
            return (
              <div key={it.linkId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={ROW}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ opacity: 0.6, fontSize: 13 }}>{maskAadhaar(p.aadhaarNumber)}</span>
                  <button
                    type="button"
                    className="doc-btn"
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                    onClick={() => setDetailsFor(open ? null : it.linkId)}
                  >
                    <Info size={15} /> {open ? T("Hide details", "विवरण छिपाएँ") : T("Details", "विवरण")}
                  </button>
                  <button
                    type="button"
                    className="doc-btn"
                    disabled={removing}
                    onClick={() => remove.mutate(it.linkId)}
                    title={T("Remove", "हटाएँ")}
                  >
                    {removing ? T("Removing…", "हटा रहे…") : <Trash2 size={15} />}
                  </button>
                </div>
                {open && (
                  <div
                    style={{
                      border: "1px solid var(--border, #333)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      background: "var(--surface-2, rgba(255,255,255,0.03))",
                    }}
                  >
                    <div>
                      <b>{T("Type", "प्रकार")}:</b>{" "}
                      {p.partyType === "company" ? T("Company/Firm", "कंपनी/फर्म") : T("Individual", "व्यक्ति")}
                    </div>
                    <div>
                      <b>{T("Name", "नाम")}:</b> {p.name}
                    </div>
                    <div>
                      <b>{T("Aadhaar", "आधार")}:</b> {p.aadhaarNumber ? formatAadhaar(p.aadhaarNumber) : "—"}
                    </div>
                    <div>
                      <b>{T("PAN", "पेन")}:</b> {p.panNumber || "—"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      <b>{T("Documents", "दस्तावेज़")}:</b>
                      {p.fileName ? (
                        <button
                          type="button"
                          className="doc-btn"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                          onClick={() => onView("parties/" + p.id + "/file")}
                        >
                          <Eye size={14} /> {T("Aadhaar front", "आधार आगे")}
                        </button>
                      ) : (
                        <span style={{ opacity: 0.5 }}>{T("no Aadhaar front", "आधार आगे नहीं")}</span>
                      )}
                      {p.aadhaarBackFileName ? (
                        <button
                          type="button"
                          className="doc-btn"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                          onClick={() => onView("parties/" + p.id + "/aadhaar-back-file")}
                        >
                          <Eye size={14} /> {T("Aadhaar back", "आधार पीछे")}
                        </button>
                      ) : (
                        <span style={{ opacity: 0.5 }}>{T("no Aadhaar back", "आधार पीछे नहीं")}</span>
                      )}
                      {p.panFileName ? (
                        <button
                          type="button"
                          className="doc-btn"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                          onClick={() => onView("parties/" + p.id + "/pan-file")}
                        >
                          <Eye size={14} /> {T("PAN card", "पेन कार्ड")}
                        </button>
                      ) : (
                        <span style={{ opacity: 0.5 }}>{T("no PAN card", "पेन कार्ड नहीं")}</span>
                      )}
                    </div>
                    <div style={{ opacity: 0.6 }}>
                      {T("Added", "जोड़ा गया")}: {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!expanded ? (
        <button
          type="button"
          className="doc-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={() => setExpanded(true)}
        >
          <Plus size={15} /> {T("Add new", "नया जोड़ें")}
        </button>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
            {autoFilled && (
              <span style={{ fontSize: 11, opacity: 0.55, flexBasis: "100%" }}>
                {T(
                  "Auto-filled — please verify before adding.",
                  "अपने आप भर गया — जोड़ने से पहले जांच लें।",
                )}
              </span>
            )}
            <select
              className="district-input"
              style={{ flex: "0 0 130px" }}
              value={partyType}
              onChange={(e) => setPartyType(e.target.value as PartyType)}
            >
              <option value="individual">{T("Individual", "व्यक्ति")}</option>
              <option value="company">{T("Company/Firm", "कंपनी/फर्म")}</option>
            </select>
            <input
              className="district-input"
              style={{ flex: "1 1 150px" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={partyType === "company" ? T("Company/Firm name", "कंपनी/फर्म का नाम") : T("Name", "नाम")}
            />
            <input
              className="district-input"
              style={{ flex: "1 1 150px" }}
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value)}
              placeholder={T("Aadhaar number", "आधार नंबर")}
              inputMode="numeric"
            />
            <DocSlot
              label={T("Aadhaar (front)", "आधार (आगे)")}
              slot="aadhaar"
              ocrBusy={ocrBusy}
              T={T}
              fileInputRef={fileRef}
              camInputRef={frontCamRef}
              onFile={(e) => onFilePick(e, "aadhaar", setFile)}
              onCamera={(e) => onCameraPick(e, "aadhaar", setFile)}
            />
            <DocSlot
              label={T("Aadhaar (back)", "आधार (पीछे)")}
              slot="aadhaarBack"
              ocrBusy={ocrBusy}
              T={T}
              fileInputRef={aadhaarBackFileRef}
              camInputRef={backCamRef}
              onFile={(e) => onFilePick(e, "aadhaarBack", setAadhaarBack)}
              onCamera={(e) => onCameraPick(e, "aadhaarBack", setAadhaarBack)}
            />
            <input
              className="district-input"
              style={{ flex: "1 1 130px" }}
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder={T("PAN number", "पेन नंबर")}
            />
            <DocSlot
              label={T("PAN card", "पेन कार्ड")}
              slot="pan"
              ocrBusy={ocrBusy}
              T={T}
              fileInputRef={panFileRef}
              camInputRef={panCamRef}
              onFile={(e) => onFilePick(e, "pan", setPanFile)}
              onCamera={(e) => onCameraPick(e, "pan", setPanFile)}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="btn-calc"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                disabled={add.isPending}
                onClick={addNew}
              >
                <UserPlus size={15} /> {add.isPending ? T("Adding…", "जोड़ रहे...") : T("Save", "सेव करें")}
              </button>
              <button type="button" className="doc-btn" disabled={add.isPending} onClick={reset}>
                {T("Cancel", "रद्द करें")}
              </button>
            </div>
          </div>
          {err && (
            <p className="modal-error" style={{ marginTop: 8 }}>
              {err}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function NaxaGroup({
  deedId,
  items,
  onView,
  T,
}: {
  deedId: string;
  items: NaxaMeta[];
  onView: (path: string) => void;
  T: T;
}) {
  const add = useAddNaxa(deedId);
  const remove = useRemoveNaxa(deedId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    add.mutate(f, {
      onSuccess: () => {
        if (fileRef.current) fileRef.current.value = "";
      },
      onError: (er) => setErr(er.message),
    });
  }

  return (
    <section style={{ borderTop: "1px solid var(--border, #333)", paddingTop: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>
        {T("Property map (Naxa)", "संपत्ति नक्शा")} <span style={{ opacity: 0.55 }}>({items.length})</span>
      </h4>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {items.map((n) => {
            const removing = remove.isPending && remove.variables === n.id;
            return (
              <div key={n.id} style={ROW}>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.fileName}</span>
                <button
                  type="button"
                  className="doc-btn"
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                  onClick={() => onView("deeds/" + deedId + "/naxa/" + n.id + "/file")}
                >
                  <Eye size={15} /> {T("View", "देखें")}
                </button>
                <button type="button" className="doc-btn" disabled={removing} onClick={() => remove.mutate(n.id)} title={T("Remove", "हटाएँ")}>
                  {removing ? T("Removing…", "हटा रहे…") : <Trash2 size={15} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="btn-calc" style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
        <FileUp size={15} /> {add.isPending ? T("Uploading…", "अपलोड हो रहा…") : T("Upload map (image / PDF / Word)", "नक्शा अपलोड करें (इमेज / PDF / Word)")}
        <input ref={fileRef} type="file" accept={NAXA_ACCEPT} onChange={onFile} style={{ display: "none" }} />
      </label>
      {err && (
        <p className="modal-error" style={{ marginTop: 8 }}>
          {err}
        </p>
      )}
    </section>
  );
}
