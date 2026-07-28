import { useEffect, useMemo, useRef, useState } from "react";
import { DeedPropertyDetailCreateInput } from "@sampada/shared";
import { buildNakshaSvg, checkAreaMismatch, computeAreas } from "@sampada/naksha-render";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { apiErrorMessage } from "../../lib/api";
import { useDeedPropertyDetail, useExtractDeedPropertyDetail, useSaveDeedPropertyDetail } from "./useDeedPropertyDetail";
import { downloadNakshaPdf } from "./nakshaPdf";

interface FormState {
  plotNo: string;
  block: string;
  location: string;
  sellerName: string;
  buyerName: string;
  ewLength: string;
  nsLength: string;
  unit: "ft" | "m";
  statedArea: string;
  statedAreaUnit: "sqft" | "sqm";
  north: string;
  south: string;
  east: string;
  west: string;
}

const EMPTY_FORM: FormState = {
  plotNo: "",
  block: "",
  location: "",
  sellerName: "",
  buyerName: "",
  ewLength: "",
  nsLength: "",
  unit: "ft",
  statedArea: "",
  statedAreaUnit: "sqft",
  north: "",
  south: "",
  east: "",
  west: "",
};

const PREVIEW_DEBOUNCE_MS = 300;

function fmtArea(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Structured plot data for a deed — plot number, full address (as one free-
 * text block), length/breadth, and chauhaddi (boundaries). Drives both the
 * computed-area chips and a live naksha (site plan) preview from the same
 * source of truth, so the deed text and the drawing can never disagree.
 * Validation is entirely DeedPropertyDetailCreateInput.safeParse — no
 * separate validation logic. Seller/buyer names are read from the deed's own
 * text (via the same AI extraction as everything else here), not from the
 * separate Party/DeedParty records, since the deed text is the authoritative
 * naming format for the naksha.
 */
export function DeedPropertyDetailSection({ deedId }: { deedId: string }) {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);

  const record = useDeedPropertyDetail(deedId);
  const save = useSaveDeedPropertyDetail(deedId);
  const extract = useExtractDeedPropertyDetail(deedId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [svg, setSvg] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  // Nothing saved yet for this deed — wait for staff to explicitly ask for a naksha (via the
  // "Generate Naksha" button below) rather than firing the AI extraction on every page load.
  const [started, setStarted] = useState(false);

  // Seed from the server's copy exactly once per deed.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!record.data || seededRef.current === deedId) return;
    seededRef.current = deedId;
    const d = record.data;
    setForm({
      plotNo: d.plotNo ?? "",
      block: d.block ?? "",
      location: d.location,
      sellerName: d.sellerName ?? "",
      buyerName: d.buyerName ?? "",
      ewLength: String(d.ewLength),
      nsLength: String(d.nsLength),
      unit: d.unit,
      statedArea: d.statedArea != null ? String(d.statedArea) : "",
      statedAreaUnit: d.statedAreaUnit ?? "sqft",
      north: d.boundaries.north,
      south: d.boundaries.south,
      east: d.boundaries.east,
      west: d.boundaries.west,
    });
  }, [record.data, deedId]);

  // No saved property detail yet — ask the server to read the deed's own
  // text with Claude and pre-fill whatever it finds (chauhaddi, area,
  // address, seller/buyer names, this plot's own plot number, and — when the
  // deed states them explicitly — the E-W/N-S edge measurements themselves).
  // An LLM reads the text the way a person would, so it isn't thrown off by
  // one deed's phrasing differing from another's the way a fixed regex
  // would be; it's also told to tell this plot's own numbers apart from a
  // neighboring plot's number mentioned only in the chauhaddi. Runs once per
  // deed. Never overwrites a saved record, and never saves anything itself —
  // every field stays fully editable for staff to correct.
  const extractSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!started) return;
    if (extractSeededRef.current === deedId) return;
    if (!record.isSuccess || record.data) return;
    extractSeededRef.current = deedId;
    setExtractError(null);
    extract
      .mutateAsync()
      .then((extracted) => {
        const hasAny =
          Object.values(extracted.boundaries).some(Boolean) ||
          extracted.statedArea != null ||
          extracted.ewLength != null ||
          extracted.nsLength != null ||
          !!extracted.plotNo ||
          !!extracted.location ||
          !!extracted.block ||
          !!extracted.sellerName ||
          !!extracted.buyerName;
        if (!hasAny) return;
        setForm((f) => ({
          ...f,
          plotNo: extracted.plotNo ?? f.plotNo,
          block: extracted.block ?? f.block,
          location: extracted.location ?? f.location,
          sellerName: extracted.sellerName ?? f.sellerName,
          buyerName: extracted.buyerName ?? f.buyerName,
          ewLength: extracted.ewLength != null ? String(extracted.ewLength) : f.ewLength,
          nsLength: extracted.nsLength != null ? String(extracted.nsLength) : f.nsLength,
          unit: extracted.unit ?? f.unit,
          statedArea: extracted.statedArea != null ? String(extracted.statedArea) : f.statedArea,
          statedAreaUnit: extracted.statedAreaUnit ?? f.statedAreaUnit,
          north: extracted.boundaries.north ?? f.north,
          south: extracted.boundaries.south ?? f.south,
          east: extracted.boundaries.east ?? f.east,
          west: extracted.boundaries.west ?? f.west,
        }));
        setAutoFilled(true);
      })
      .catch(async (err) => {
        setExtractError(await apiErrorMessage(err, t("propDetailExtractFailed")));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, record.isSuccess, record.data, deedId]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  const parsed = useMemo(() => {
    const hasStatedArea = form.statedArea.trim() !== "";
    return DeedPropertyDetailCreateInput.safeParse({
      plotNo: form.plotNo || undefined,
      block: form.block || undefined,
      location: form.location,
      sellerName: form.sellerName || undefined,
      buyerName: form.buyerName || undefined,
      shape: "rectangle",
      ewLength: Number(form.ewLength),
      nsLength: Number(form.nsLength),
      unit: form.unit,
      statedArea: hasStatedArea ? Number(form.statedArea) : undefined,
      statedAreaUnit: hasStatedArea ? form.statedAreaUnit : undefined,
      boundaries: { north: form.north, south: form.south, east: form.east, west: form.west },
    });
  }, [form]);

  const input = parsed.success ? parsed.data : null;

  const areas = useMemo(() => (input ? computeAreas(input) : null), [input]);
  const mismatch = useMemo(() => (input ? checkAreaMismatch(input) : null), [input]);

  // Debounced live naksha preview — pure function of `input`, so no stale renders.
  useEffect(() => {
    if (!input) {
      setSvg("");
      return;
    }
    const timer = setTimeout(() => {
      setSvg(buildNakshaSvg(input, { sellerName: input.sellerName, buyerName: input.buyerName }, lang));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, lang]);

  async function onSave() {
    if (!input) return;
    setSaveError(null);
    try {
      await save.mutateAsync(input);
      setSaved(true);
    } catch (err) {
      setSaveError(await apiErrorMessage(err, t("propDetailSaveFailed")));
    }
  }

  async function onDownloadPdf() {
    if (!svg) return;
    setPdfBusy(true);
    setPdfFailed(false);
    try {
      await downloadNakshaPdf(svg, `naksha-${form.plotNo || deedId}`);
    } catch {
      setPdfFailed(true);
    } finally {
      setPdfBusy(false);
    }
  }

  if (record.isLoading) return null;

  if (!record.data && !started) {
    return (
      <div className="modal-form" style={{ marginTop: 28 }}>
        <h3 className="page-title" style={{ fontSize: 18, margin: 0 }}>
          {t("propDetailHeading")}
        </h3>
        <button type="button" className="btn-calc" onClick={() => setStarted(true)}>
          {t("propDetailGenerateBtn")}
        </button>
      </div>
    );
  }

  return (
    <div className="modal-form" style={{ marginTop: 28 }}>
      <h3 className="page-title" style={{ fontSize: 18, margin: 0 }}>
        {t("propDetailHeading")}
      </h3>
      {extract.isPending && (
        <p className="doc-sub" style={{ margin: 0, opacity: 0.7 }} aria-live="polite">
          {t("propDetailExtracting")}
        </p>
      )}
      {autoFilled && <p className="propdetail-warning" style={{ margin: 0 }}>{t("propDetailAutoFilled")}</p>}
      {extractError && <p className="modal-error" style={{ margin: 0 }}>{extractError}</p>}

      <div className="propdetail-layout">
      <div className="propdetail-fields">
      <div className="form-grid">
        <label className="modal-field">
          {t("propDetailPlotNo")}
          <input value={form.plotNo} onChange={(e) => setField("plotNo", e.target.value)} />
        </label>
        <label className="modal-field">
          {t("propDetailBlock")}
          <input value={form.block} onChange={(e) => setField("block", e.target.value)} />
        </label>

        <label className="modal-field form-field--full">
          {t("propDetailLocation")}
          <input value={form.location} onChange={(e) => setField("location", e.target.value)} required />
        </label>

        <label className="modal-field">
          {t("propDetailSellerName")}
          <input value={form.sellerName} onChange={(e) => setField("sellerName", e.target.value)} />
        </label>
        <label className="modal-field">
          {t("propDetailBuyerName")}
          <input value={form.buyerName} onChange={(e) => setField("buyerName", e.target.value)} />
        </label>

        <label className="modal-field">
          {t("propDetailEwLength")}
          <input
            type="number"
            min="0"
            step="any"
            value={form.ewLength}
            onChange={(e) => setField("ewLength", e.target.value)}
            required
          />
        </label>
        <label className="modal-field">
          {t("propDetailNsLength")}
          <input
            type="number"
            min="0"
            step="any"
            value={form.nsLength}
            onChange={(e) => setField("nsLength", e.target.value)}
            required
          />
        </label>

        <label className="modal-field">
          {t("propDetailUnit")}
          <select value={form.unit} onChange={(e) => setField("unit", e.target.value as "ft" | "m")}>
            <option value="ft">{t("propDetailUnitFt")}</option>
            <option value="m">{t("propDetailUnitM")}</option>
          </select>
        </label>

        <div className="modal-field form-field--full">
          {t("propDetailComputedArea")}
          <div className="propdetail-chips">
            {areas ? (
              <>
                <span className="propdetail-chip">{fmtArea(areas.sqft)} {t("propDetailAreaUnitSqft")}</span>
                <span className="propdetail-chip">{fmtArea(areas.sqm)} {t("propDetailAreaUnitSqm")}</span>
              </>
            ) : (
              <span className="propdetail-chip">—</span>
            )}
          </div>
        </div>

        <label className="modal-field">
          {t("propDetailStatedArea")}
          <input
            type="number"
            min="0"
            step="any"
            value={form.statedArea}
            onChange={(e) => setField("statedArea", e.target.value)}
          />
        </label>
        <label className="modal-field">
          {t("propDetailUnit")}
          <select
            value={form.statedAreaUnit}
            onChange={(e) => setField("statedAreaUnit", e.target.value as "sqft" | "sqm")}
          >
            <option value="sqft">{t("propDetailAreaUnitSqft")}</option>
            <option value="sqm">{t("propDetailAreaUnitSqm")}</option>
          </select>
        </label>

        {mismatch && !mismatch.ok && mismatch.diffPercent != null && (
          <div className="propdetail-warning form-field--full">
            {t("propDetailMismatchPrefix")} {Math.abs(mismatch.diffPercent).toFixed(1)}
            {t("propDetailMismatchSuffix")}
          </div>
        )}

        <div className="form-field--full" style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
          {t("propDetailBoundaries")}
        </div>
        <label className="modal-field">
          {t("propDetailBoundaryNorth")}
          <input value={form.north} onChange={(e) => setField("north", e.target.value)} required />
        </label>
        <label className="modal-field">
          {t("propDetailBoundarySouth")}
          <input value={form.south} onChange={(e) => setField("south", e.target.value)} required />
        </label>
        <label className="modal-field">
          {t("propDetailBoundaryEast")}
          <input value={form.east} onChange={(e) => setField("east", e.target.value)} required />
        </label>
        <label className="modal-field">
          {t("propDetailBoundaryWest")}
          <input value={form.west} onChange={(e) => setField("west", e.target.value)} required />
        </label>
      </div>

      {saveError && <p className="modal-error">{saveError}</p>}
      {pdfFailed && <p className="modal-error">{t("propDetailPdfFailed")}</p>}

      <div className="deed-edit-actions">
        <button type="button" className="doc-btn" disabled={!input || save.isPending} onClick={() => void onSave()}>
          {save.isPending ? t("propDetailSaving") : saved ? t("propDetailSaved") : t("propDetailSave")}
        </button>
        <button type="button" className="doc-btn" disabled={!svg || pdfBusy} onClick={() => void onDownloadPdf()}>
          {pdfBusy ? "…" : t("propDetailDownloadPdf")}
        </button>
      </div>
      </div>

      <div className="propdetail-preview-col">
        <div className="modal-field">
          {t("propDetailPreviewHeading")}
          <div className="propdetail-preview">
            {svg ? (
              <div dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="propdetail-preview-empty">{t("propDetailPreviewEmpty")}</div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
