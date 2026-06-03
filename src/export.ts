import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Annotation } from './types';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

export async function exportPdf(
  pdfBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const pdfPages = pdfDoc.getPages();

  const byPage = new Map<number, Annotation[]>();
  for (const a of annotations) {
    const list = byPage.get(a.pageIndex) ?? [];
    list.push(a);
    byPage.set(a.pageIndex, list);
  }

  for (const [pageIndex, anns] of byPage) {
    const page = pdfPages[pageIndex];
    if (!page) continue;
    const heightPt = page.getHeight();

    for (const a of anns) {
      if (a.type === 'text') {
        if (!a.text.trim()) continue;
        const fontSize = a.fontSize;
        const lineHeight = fontSize * 1.2;
        const ascent = fontSize * 0.85;
        const topPdf = heightPt - a.y;
        const { r, g, b } = hexToRgb(a.color);
        const lines = a.text.split('\n');
        lines.forEach((line, i) => {
          page.drawText(line, {
            x: a.x,
            y: topPdf - i * lineHeight - ascent,
            size: fontSize,
            font: helvetica,
            color: rgb(r, g, b),
          });
        });
      } else if (a.type === 'grid') {
        if (!a.text) continue;
        const fontSize = a.fontSize;
        const ascent = fontSize * 0.85;
        const baselineY = heightPt - a.y - (a.height - fontSize) / 2 - ascent;
        const { r, g, b } = hexToRgb(a.color);
        for (let i = 0; i < a.text.length && i < a.boxCount; i++) {
          const ch = a.text[i];
          if (ch === ' ') continue;
          const charWidth = courier.widthOfTextAtSize(ch, fontSize);
          const centerX = a.x + i * a.boxWidth + a.boxWidth / 2;
          page.drawText(ch, {
            x: centerX - charWidth / 2,
            y: baselineY,
            size: fontSize,
            font: courier,
            color: rgb(r, g, b),
          });
        }
      } else if (a.type === 'checkbox') {
        if (!a.checked) continue;
        const { r, g, b } = hexToRgb(a.color);
        const yTopPdf = heightPt - a.y;
        const yBotPdf = heightPt - a.y - a.height;
        const thickness = Math.max(0.7, Math.min(a.width, a.height) * 0.14);
        // Two-segment check mark: down-stroke from upper-left to middle-bottom,
        // then up-stroke to upper-right.
        const elbow = {
          x: a.x + a.width * 0.42,
          y: yBotPdf + a.height * 0.22,
        };
        page.drawLine({
          start: { x: a.x + a.width * 0.18, y: yTopPdf - a.height * 0.5 },
          end: elbow,
          thickness,
          color: rgb(r, g, b),
        });
        page.drawLine({
          start: elbow,
          end: { x: a.x + a.width * 0.86, y: yTopPdf - a.height * 0.12 },
          thickness,
          color: rgb(r, g, b),
        });
      } else {
        const png = await pdfDoc.embedPng(a.dataUrl);
        page.drawImage(png, {
          x: a.x,
          y: heightPt - (a.y + a.height),
          width: a.width,
          height: a.height,
        });
      }
    }
  }

  return pdfDoc.save();
}

export function downloadBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
