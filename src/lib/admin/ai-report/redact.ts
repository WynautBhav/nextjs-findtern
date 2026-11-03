/**
 * Browser-side redaction of an Incruiter feedback report.
 *
 * Runs only in the admin's browser (canvas + pdf.js), loaded with dynamic
 * `import()` so the server bundle never sees it. The PDF is not uploaded for
 * this: only the redacted result goes to Drive.
 *
 * What it does, for a report whose personal data is in the first-page header:
 *  - page 1 is rasterised at 216 DPI and every text line in the header block is
 *    pixelated + blurred, then stored as a lossless PNG. That page has no text
 *    layer afterwards, so the redacted words cannot be copied out;
 *  - every other page is copied from the original untouched (still vector, text
 *    stays sharp and selectable), minus its link annotations: a link back to
 *    page 1 would make pdf-lib copy the ORIGINAL page 1 into the output;
 *  - the whole file is then scanned for the candidate's email, phone and full
 *    name, and anything still readable outside the blurred block is reported in
 *    `leaks` so a person can look before it is published.
 */

import { digitsOf, nameTokens, type ReportHeader } from "../ai-report-match";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

/** The header block, as a fraction of the page: where Incruiter prints the candidate's details. */
const HEADER = { width: 0.45, height: 0.11 } as const;
const SCALE = 3; // 216 DPI
const MAX_PIXELS = 16_000_000; // under the ~16.7M iOS Safari canvas limit
const STRENGTH = 1.6;

type Item = { text: string; x: number; y: number; w: number; h: number };
type Box = { x: number; y: number; w: number; h: number };

/** Text items as lines in top-left page coordinates at `scale` (1 = PDF points). */
async function pageLines(pdfjs: PdfJs, page: import("pdfjs-dist").PDFPageProxy, scale: number) {
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const raw: Item[] = [];
  for (const it of content.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const t = pdfjs.Util.transform(viewport.transform, it.transform);
    const h = Math.hypot(t[2]!, t[3]!) || it.height;
    raw.push({ text: it.str, x: t[4]!, y: t[5]! - h, w: it.width * scale, h });
  }
  return { viewport, lines: mergeLines(raw) };
}

function mergeLines(items: Item[]): Item[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Item[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const same = last && Math.abs(last.y - it.y) < Math.max(3, it.h * 0.6) && it.x - (last.x + last.w) < it.h * 1.4;
    if (same) {
      const right = Math.max(last.x + last.w, it.x + it.w);
      last.text += (it.x - (last.x + last.w) > it.h * 0.2 ? " " : "") + it.text;
      last.w = right - last.x;
      last.y = Math.min(last.y, it.y);
      last.h = Math.max(last.h, it.h);
    } else {
      lines.push({ ...it });
    }
  }
  return lines;
}

const pad = ({ x, y, w, h }: Item): Box => {
  const p = Math.max(2, h * 0.18);
  return { x: x - p, y: y - p, w: w + p * 2, h: h + p * 2 };
};

/** Page-1 lines from the top of the page, in reading order: what `parseReportHeader` needs. */
export async function readHeaderLines(file: File): Promise<{ lines: string[]; pages: number }> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await pdf.getPage(1);
    const { viewport, lines } = await pageLines(pdfjs, page, 1);
    page.cleanup();
    return { lines: lines.filter((l) => l.y < viewport.height * 0.2).map((l) => l.text), pages: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}

function blurBox(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, b: Box) {
  const x = Math.max(0, Math.floor(b.x));
  const y = Math.max(0, Math.floor(b.y));
  const w = Math.min(canvas.width - x, Math.ceil(b.w));
  const h = Math.min(canvas.height - y, Math.ceil(b.h));
  if (w <= 1 || h <= 1) return;

  // 1. Pixelate: downsample hard, scale back up. Irreversible.
  const factor = Math.max(3, Math.round(h * 0.7 * STRENGTH));
  const tiny = document.createElement("canvas");
  tiny.width = Math.max(1, Math.round(w / factor));
  tiny.height = Math.max(1, Math.round(h / factor));
  tiny.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, tiny.width, tiny.height);
  const region = document.createElement("canvas");
  region.width = w;
  region.height = h;
  const rctx = region.getContext("2d")!;
  rctx.imageSmoothingEnabled = true;
  rctx.drawImage(tiny, 0, 0, w, h);

  // 2. Gaussian pass over the pixelated block, drawn slightly oversize so the edges don't fade to transparent.
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const sctx = soft.getContext("2d")!;
  const bleed = Math.ceil(Math.max(3, h * 0.18 * STRENGTH));
  sctx.filter = `blur(${Math.max(2, h * 0.16 * STRENGTH)}px)`;
  sctx.drawImage(region, -bleed, -bleed, w + bleed * 2, h + bleed * 2);
  sctx.filter = "none";
  // Flatten any alpha so nothing of the original shows through.
  sctx.globalCompositeOperation = "destination-over";
  sctx.fillStyle = "#e9e9e9";
  sctx.fillRect(0, 0, w, h);
  ctx.drawImage(soft, x, y);
}

async function renderRedactedFirstPage(pdfjs: PdfJs, pdf: import("pdfjs-dist").PDFDocumentProxy) {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
  const { viewport, lines } = await pageLines(pdfjs, page, scale);

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  const limitW = viewport.width * HEADER.width;
  const limitH = viewport.height * HEADER.height;
  const boxes = lines.filter((l) => l.x < limitW && l.y < limitH).map(pad);
  for (const b of boxes) blurBox(canvas, ctx, b);
  page.cleanup();
  return { canvas, boxes, lines, widthPt: base.width, heightPt: base.height, scale };
}

/** Is any of this candidate's personal data readable in `text`? Phone is compared by its last 10 digits. */
function mentions(text: string, header: ReportHeader): string | null {
  const lower = text.toLowerCase();
  if (header.email && lower.includes(header.email.toLowerCase())) return "email";
  if (header.phone && digitsOf(text).includes(header.phone.slice(-10))) return "phone number";
  const tokens = nameTokens(header.name ?? "");
  if (tokens.length > 0) {
    const words = new Set(nameTokens(text));
    // The whole name, or any part of it long enough to be a name rather than a word ("Ayush" in "Ayush showed...").
    // A false alarm only asks a person to look; a miss would put a name in front of an employer.
    if (tokens.length >= 2 && tokens.every((t) => words.has(t))) return "name";
    if (tokens.some((t) => t.length >= 4 && words.has(t))) return "name";
  }
  return null;
}

export type Leak = { page: number; what: string; text: string };

export type RedactResult = {
  blob: Blob;
  /** Text lines blurred on page 1. */
  blurred: number;
  /** Personal data still readable somewhere in the output. Empty means the scan found none. */
  leaks: Leak[];
  /** PNG of the redacted first page, for the admin to look at. */
  previewUrl: string;
};

export async function redactReport(file: File, header: ReportHeader): Promise<RedactResult> {
  const [pdfjs, { PDFDocument, PDFName }] = await Promise.all([loadPdfjs(), import("pdf-lib")]);
  const data = new Uint8Array(await file.arrayBuffer());
  // pdf.js can take ownership of the buffer it is given: hand it a copy.
  const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
  try {
    const src = await PDFDocument.load(data, { ignoreEncryption: true });
    if (src.isEncrypted) throw new Error("This PDF is password-protected.");
    if (src.getPageCount() !== pdf.numPages) throw new Error("This PDF could not be read reliably.");

    // Links on kept pages could drag the unredacted page 1 into the output through copyPages.
    for (let i = 1; i < pdf.numPages; i++) src.getPage(i).node.delete(PDFName.of("Annots"));

    const first = await renderRedactedFirstPage(pdfjs, pdf);
    const out = await PDFDocument.create();

    const png = await new Promise<Uint8Array>((resolve, reject) =>
      first.canvas.toBlob(
        (b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x)), reject) : reject(new Error("Could not encode page 1"))),
        "image/png",
      ),
    );
    const previewUrl = first.canvas.toDataURL("image/jpeg", 0.8);
    const img = await out.embedPng(png);
    const page1 = out.addPage([first.widthPt, first.heightPt]);
    page1.drawImage(img, { x: 0, y: 0, width: first.widthPt, height: first.heightPt });
    first.canvas.width = 0;
    first.canvas.height = 0;

    if (pdf.numPages > 1) {
      const rest = await out.copyPages(
        src,
        Array.from({ length: pdf.numPages - 1 }, (_, i) => i + 1),
      );
      rest.forEach((p) => out.addPage(p));
    }

    // Not derived from the file name: it often holds the very name being redacted.
    out.setTitle("Redacted document");
    out.setProducer("Findtern");
    out.setCreator("Findtern");
    out.setAuthor("");
    out.setSubject("");
    out.setKeywords([]);

    // Leak scan over the ORIGINAL text of every page: page 1 outside the blurred boxes, other pages anywhere.
    const leaks: Leak[] = [];
    const covered = (l: Item) => first.boxes.some((b) => l.x >= b.x - 1 && l.y >= b.y - 1 && l.x + l.w <= b.x + b.w + 1 && l.y + l.h <= b.y + b.h + 1);
    for (const l of first.lines) {
      const what = mentions(l.text, header);
      if (what && !covered(l)) leaks.push({ page: 1, what, text: l.text.slice(0, 60) });
    }
    for (let p = 2; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p);
      const { lines } = await pageLines(pdfjs, pg, 1);
      for (const l of lines) {
        const what = mentions(l.text, header);
        if (what) leaks.push({ page: p, what, text: l.text.slice(0, 60) });
      }
      pg.cleanup();
    }

    const bytes = await out.save();
    return {
      blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
      blurred: first.boxes.length,
      leaks,
      previewUrl,
    };
  } finally {
    await pdf.destroy();
  }
}
