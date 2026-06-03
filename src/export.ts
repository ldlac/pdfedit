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
