/**
 * Client-side PDF export for a deed.
 *
 * The deed is laid out in a hidden, print-styled node at true A4 width, then
 * rasterised and sliced across A4 pages. Rasterising (rather than drawing text
 * into the PDF) is deliberate: Devanagari needs real OpenType shaping to place
 * matras and form conjuncts, and the browser is the one thing in this stack
 * guaranteed to get that right. The trade-off is an image-based PDF — crisp at
 * 3x, but its text isn't selectable.
 *
 * jspdf and html2canvas are ~600KB together, so they're only fetched when
 * someone actually exports a deed.
 */

/** A4 in points, jsPDF's unit. */
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
/** Blank margin at the top and bottom of every page, like a print stylesheet's. */
const PAGE_MARGIN_PT = 48;
/** A4 width in CSS px at 96dpi — lay out at page width so line wrapping matches print. */
const PAGE_WIDTH_PX = 794;
/** Render at 3x for print-sharp text (~280dpi). */
const SCALE = 3;

/** The deed's pixels, plus the y offsets (canvas px) where a page may safely break. */
interface DeedRaster {
  canvas: HTMLCanvasElement;
  /** Ascending offsets, each the bottom edge of a rendered line of text. */
  lineBreaks: number[];
}

/** Rasterises the deed's print layout — the pixels that become the PDF's pages. */
async function renderDeedCanvas(title: string, content: string): Promise<DeedRaster> {
  const html2canvas = await import("html2canvas").then((m) => m.default);
  const node = buildPrintNode(title, content);
  document.body.appendChild(node);
  try {
    // html2canvas paints whatever is on screen *now*, so the Devanagari face
    // has to be loaded before the snapshot — otherwise the deed rasterises in
    // a fallback font. Mounting the node first makes the browser fetch it.
    await ensureFontsReady();
    // Measure the lines while the node is still mounted: once it's gone, the
    // canvas is just pixels and we'd have no idea where a line ends.
    const lineBreaks = measureLineBreaks(node);
    const canvas = await html2canvas(node, {
      scale: SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
    return { canvas, lineBreaks };
  } finally {
    node.remove();
  }
}

/** Renders `title` + `content` to an A4 PDF and downloads it as "<title>.pdf". */
export async function downloadDeedPdf(title: string, content: string): Promise<void> {
  const pdf = await buildDeedPdf(title, content);
  pdf.save(`${sanitizeFilename(title)}.pdf`);
}

/** Lays the deed out across A4 pages and returns the jsPDF document. */
async function buildDeedPdf(title: string, content: string) {
  const [{ jsPDF }, { canvas, lineBreaks }] = await Promise.all([
    import("jspdf"),
    renderDeedCanvas(title, content),
  ]);

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  // The layout is exactly one page wide, so this ratio converts the whole
  // canvas between device pixels and PDF points.
  const pxPerPt = canvas.width / A4_WIDTH_PT;
  const contentHeightPx = Math.floor((A4_HEIGHT_PT - 2 * PAGE_MARGIN_PT) * pxPerPt);

  for (const [index, { top, bottom }] of paginate(
    canvas,
    contentHeightPx,
    lineBreaks,
  ).entries()) {
    const sliceHeight = bottom - top;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (index > 0) pdf.addPage();
    // JPEG, not PNG: a page of black-on-white text is ~250KB instead of ~2MB,
    // and at quality .95 the artefacts aren't visible at 3x.
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.95),
      "JPEG",
      0,
      PAGE_MARGIN_PT,
      A4_WIDTH_PT,
      sliceHeight / pxPerPt,
    );
  }

  return pdf;
}

/** A fold must sit in a blank band at least this tall (canvas px), and is cut through its middle. */
const MIN_GAP_PX = 9;
/** How far back from a page's limit we'll look for that blank band (canvas px, ≈6 lines). */
const MAX_SCAN_PX = 500;

/**
 * Splits the rasterised deed into page-sized bands, each ending in whitespace.
 *
 * Cutting every `contentHeightPx` exactly — the obvious way — shears whichever
 * line straddles the fold, leaving its top half on one page and its bottom half
 * on the next. Cutting at the last line *box* that fits is closer, but still
 * wrong for Devanagari: below-base marks (ृ, ु) and descenders overflow the line
 * box, so the box's bottom edge still runs through ink and sheds slivers onto
 * the next page.
 *
 * So the fold is found in the pixels instead: scan up from the page limit for a
 * band of fully blank rows and cut through its middle, which by construction
 * crosses no ink at all. Line boxes are kept only as a fallback for text so
 * dense it has no blank band (and a hard cut as a last resort, so a pathological
 * deed can't spin here forever).
 */
function paginate(
  canvas: HTMLCanvasElement,
  contentHeightPx: number,
  lineBreaks: number[],
): Array<{ top: number; bottom: number }> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const pages: Array<{ top: number; bottom: number }> = [];
  let top = 0;

  while (top < canvas.height) {
    const limit = top + contentHeightPx;
    if (limit >= canvas.height) {
      pages.push({ top, bottom: canvas.height });
      break;
    }
    const blankFold = ctx ? findBlankFold(ctx, canvas.width, top, limit) : null;
    const lastLine = lineBreaks.filter((y) => y > top && y <= limit).pop();
    const bottom = blankFold ?? lastLine ?? limit;
    pages.push({ top, bottom });
    top = bottom;
  }

  return pages;
}

/** Lowest y at or above `limit` that sits in the middle of a blank band, or null if there is none. */
function findBlankFold(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  limit: number,
): number | null {
  const scanTop = Math.max(top + MIN_GAP_PX + 1, limit - MAX_SCAN_PX);
  if (limit <= scanTop) return null;

  const { data } = ctx.getImageData(0, scanTop, width, limit - scanTop);
  const isBlankRow = (row: number): boolean => {
    const start = row * width * 4;
    for (let x = 0; x < width; x++) {
      const px = start + x * 4;
      // Near-white, not exactly white: antialiased glyph edges are pale grey.
      if (data[px]! < 245 || data[px + 1]! < 245 || data[px + 2]! < 245) return false;
    }
    return true;
  };

  // Walk up from the limit so the page keeps as much text as it can hold.
  let run = 0;
  for (let row = limit - scanTop - 1; row >= 0; row--) {
    if (!isBlankRow(row)) {
      run = 0;
      continue;
    }
    run++;
    // Cut through the middle of the band: clear of the ink below by half the
    // gap, with only more whitespace above.
    if (run >= MIN_GAP_PX) return scanTop + row + Math.floor(run / 2);
  }
  return null;
}

/**
 * The bottom edge of every rendered line, in canvas pixels relative to the
 * node's top. A Range over a text node reports one rect per *rendered* line, so
 * this sees the real wrapped lines, not the source's newlines — and because a
 * line box includes its leading, its bottom edge sits below the glyphs, clear of
 * Devanagari's below-base marks.
 */
function measureLineBreaks(node: HTMLElement): number[] {
  const nodeTop = node.getBoundingClientRect().top;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const bottoms: number[] = [];

  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of Array.from(range.getClientRects())) {
      // Rects are CSS px; html2canvas rasterises at SCALE, so that's the factor.
      if (rect.height > 0) bottoms.push((rect.bottom - nodeTop) * SCALE);
    }
  }

  return [...new Set(bottoms.map((y) => Math.round(y)))].sort((a, b) => a - b);
}

/** Off-screen A4-width page: deed name as heading, body with the print view's pre-wrap spacing. */
function buildPrintNode(title: string, content: string): HTMLElement {
  const page = document.createElement("div");
  page.style.cssText = [
    "position:absolute",
    "left:-10000px",
    "top:0",
    `width:${PAGE_WIDTH_PX}px`,
    "box-sizing:border-box",
    // Side margins only — the top and bottom ones are applied per page when the
    // slices are placed, so every page gets them, not just the first and last.
    "padding:0 64px",
    "background:#ffffff",
    "color:#111111",
    'font-family:"Public Sans","Noto Sans Devanagari",sans-serif',
    "font-size:15px",
    "line-height:1.8",
  ].join(";");

  const heading = document.createElement("h1");
  heading.textContent = title;
  heading.style.cssText = [
    "margin:0 0 28px",
    "font-size:22px",
    "font-weight:700",
    "text-align:center",
    "line-height:1.5",
    'font-family:"Archivo","Noto Sans Devanagari",sans-serif',
  ].join(";");

  const body = document.createElement("div");
  // textContent, not innerHTML — the deed body is user-authored text.
  body.textContent = content;
  body.style.cssText = "margin:0;white-space:pre-wrap;overflow-wrap:break-word";

  page.append(heading, body);
  return page;
}

async function ensureFontsReady(): Promise<void> {
  if (!("fonts" in document)) return;
  try {
    await Promise.all([
      document.fonts.load('400 15px "Noto Sans Devanagari"'),
      document.fonts.load('700 22px "Noto Sans Devanagari"'),
    ]);
  } catch {
    // Font API refused the request — fall through; fonts.ready still waits on
    // whatever the node itself triggered.
  }
  await document.fonts.ready;
}

/** Deed name as a filename: strips what Windows/macOS reject, never returns "". */
export function sanitizeFilename(name: string): string {
  const printable = [...name]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f; // drop control characters
    })
    .join("");
  const cleaned = printable
    .replace(/[\\/:*?"<>|]/g, " ") // illegal in Windows filenames
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "") // a leading or trailing dot hides or breaks the file
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned || "deed";
}
