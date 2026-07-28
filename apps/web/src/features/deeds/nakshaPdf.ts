/**
 * Client-side PDF export for a naksha (site plan) SVG string built by
 * @sampada/naksha-render's buildNakshaSvg. Rasterises the SVG the same way
 * deedPdf.ts rasterises deed text — html2canvas, so the browser (not a PDF
 * text engine) handles Devanagari shaping — onto a single, true A4 PDF page
 * (matching deedPdf.ts's page size), top-aligned with the same margin
 * convention. jspdf/html2canvas are lazy-imported, same as deedPdf.ts.
 */
import { sanitizeFilename } from "./deedPdf";

/** A4 in points, jsPDF's unit — same constants as deedPdf.ts. */
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PAGE_MARGIN_PT = 48;
/** Render at 3x for print-sharp lines and text (~280dpi). */
const SCALE = 3;
const FALLBACK_WIDTH_PX = 794;
const FALLBACK_HEIGHT_PX = 1000;

function parseSvgSize(svg: string): { width: number; height: number } {
  const widthMatch = svg.match(/width="(\d+(?:\.\d+)?)"/);
  const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
  return {
    width: widthMatch?.[1] ? Number(widthMatch[1]) : FALLBACK_WIDTH_PX,
    height: heightMatch?.[1] ? Number(heightMatch[1]) : FALLBACK_HEIGHT_PX,
  };
}

async function ensureFontsReady(): Promise<void> {
  if (!("fonts" in document)) return;
  try {
    await document.fonts.load('400 14px "Noto Sans Devanagari"');
  } catch {
    // Font API refused the request — fall through; fonts.ready still waits.
  }
  await document.fonts.ready;
}

async function renderNakshaCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const html2canvas = await import("html2canvas").then((m) => m.default);
  const container = document.createElement("div");
  container.style.cssText = [
    "position:absolute",
    "left:-10000px",
    "top:0",
    `width:${width}px`,
    `height:${height}px`,
    "background:#ffffff",
  ].join(";");
  container.innerHTML = svg;
  document.body.appendChild(container);
  try {
    await ensureFontsReady();
    return await html2canvas(container, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true });
  } finally {
    container.remove();
  }
}

/** Renders a naksha SVG string onto a single true-A4 PDF page and downloads it as "<filename>.pdf". */
export async function downloadNakshaPdf(svg: string, filename: string): Promise<void> {
  const { width, height } = parseSvgSize(svg);
  const [{ jsPDF }, canvas] = await Promise.all([import("jspdf"), renderNakshaCanvas(svg, width, height)]);

  const availableWidthPt = A4_WIDTH_PT - 2 * PAGE_MARGIN_PT;
  const availableHeightPt = A4_HEIGHT_PT - 2 * PAGE_MARGIN_PT;
  // Convert CSS px (96dpi) to PDF points (72dpi), then scale to fit within
  // the page's printable area (naksha content is almost always narrower
  // than an A4 page top-to-bottom, but this guards against a very tall one).
  const naturalWidthPt = (width * 72) / 96;
  const naturalHeightPt = (height * 72) / 96;
  // No upper cap here: a naksha's natural (unscaled) height is usually much shorter than a
  // full A4 page, and it should scale UP to fill the printable area (bounded by whichever of
  // width/height is tighter) rather than sit small at the top with the rest of the page blank.
  const fitScale = Math.min(availableWidthPt / naturalWidthPt, availableHeightPt / naturalHeightPt);
  const imgWidthPt = naturalWidthPt * fitScale;
  const imgHeightPt = naturalHeightPt * fitScale;
  const x = (A4_WIDTH_PT - imgWidthPt) / 2;
  const y = (A4_HEIGHT_PT - imgHeightPt) / 2;

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, imgWidthPt, imgHeightPt);
  pdf.save(`${sanitizeFilename(filename)}.pdf`);
}
