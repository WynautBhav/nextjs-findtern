import { pdfSafe, type ProposalPdfText } from "./proposal-pdf.ts";

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const LABEL_W = 150;

/**
 * Lays the proposal's words out on A4 pages with the standard Helvetica (every string through pdfSafe, since the
 * standard fonts encode WinAnsi only). pdf-lib is loaded on demand, as the AI-report redactor does.
 */
export async function renderProposalPdf(t: ProposalPdfText): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(t.title));
  doc.setCreator("Findtern admin");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.11, 0.1);
  const subtle = rgb(0.38, 0.43, 0.41);
  const brand = rgb(0.04, 0.38, 0.29);
  const rule = rgb(0.89, 0.91, 0.9);

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const need = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };
  const wrap = (text: string, size: number, width: number, f = font) => {
    const lines: string[] = [];
    for (const para of pdfSafe(text).split(/\s*\n\s*/)) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) <= width || !line) line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  page.drawText("Findtern", { x: M, y: y - 16, size: 18, font: bold, color: brand });
  y -= 40;
  page.drawText(pdfSafe(t.title), { x: M, y, size: 15, font: bold, color: ink });
  y -= 18;
  for (const l of wrap(t.subtitle, 9, A4.w - 2 * M)) {
    page.drawText(l, { x: M, y, size: 9, font, color: subtle });
    y -= 12;
  }
  y -= 8;

  for (const s of t.sections) {
    need(40);
    page.drawText(pdfSafe(s.heading), { x: M, y, size: 11.5, font: bold, color: ink });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: rule });
    y -= 14;
    for (const [label, value] of s.rows) {
      const lines = wrap(value || "-", 10, A4.w - 2 * M - LABEL_W);
      need(lines.length * 13 + 4);
      page.drawText(pdfSafe(label), { x: M, y, size: 10, font, color: subtle });
      for (const l of lines) {
        page.drawText(l, { x: M + LABEL_W, y, size: 10, font, color: ink });
        y -= 13;
      }
      y -= 4;
    }
    y -= 10;
  }
  return doc.save();
}
