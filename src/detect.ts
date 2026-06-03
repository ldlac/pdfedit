import type { PDFDocumentProxy } from 'pdfjs-dist';
import { OPS } from 'pdfjs-dist';
import type { Suggestion } from './types';

interface PdfjsAnnotation {
  subtype?: string;
  rect?: number[];
  fieldType?: string;
  fieldName?: string;
  id?: string;
  readOnly?: boolean;
}

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformPoint(m: Matrix, x: number, y: number) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;
}

function transformRect(m: Matrix, x: number, y: number, w: number, h: number): Rect {
  const corners = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map(([px, py]) => transformPoint(m, px, py));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function near(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

function extractRects(
  ops: number[],
  coords: number[],
  ctm: Matrix,
  out: Rect[],
) {
  let idx = 0;
  // Track the current sub-path so we can detect rectangles drawn as
  // moveTo/lineTo×3/closePath (common when PDFs avoid the rectangle op).
  let pathStart: [number, number] | null = null;
  let pathPoints: Array<[number, number]> = [];

  const flushPath = () => {
    if (pathPoints.length === 4 && pathStart) {
      // Axis-aligned rect if the 4 points form one.
      const pts = [...pathPoints];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = maxX - minX;
      const h = maxY - minY;
      let axisAligned = true;
      for (const [px, py] of pts) {
        if (
          !(near(px, minX, 0.5) || near(px, maxX, 0.5)) ||
          !(near(py, minY, 0.5) || near(py, maxY, 0.5))
        ) {
          axisAligned = false;
          break;
        }
      }
      if (axisAligned && w > 0 && h > 0) {
        out.push(transformRect(ctm, minX, minY, w, h));
      }
    }
    pathPoints = [];
    pathStart = null;
  };

  for (const subop of ops) {
    if (subop === OPS.moveTo) {
      flushPath();
      const x = coords[idx++];
      const y = coords[idx++];
      pathStart = [x, y];
      pathPoints = [[x, y]];
    } else if (subop === OPS.lineTo) {
      const x = coords[idx++];
      const y = coords[idx++];
      pathPoints.push([x, y]);
    } else if (subop === OPS.curveTo) {
      idx += 6;
      pathPoints = []; // invalidate rect detection
    } else if (subop === OPS.curveTo2 || subop === OPS.curveTo3) {
      idx += 4;
      pathPoints = [];
    } else if (subop === OPS.closePath) {
      // closePath: keep pathPoints as-is, flush after
    } else if (subop === OPS.rectangle) {
      const x = coords[idx++];
      const y = coords[idx++];
      const w = coords[idx++];
      const h = coords[idx++];
      if (w > 0 && h > 0) {
        out.push(transformRect(ctm, x, y, w, h));
      }
    }
  }
  flushPath();
}

function dedupeRects(rects: Rect[]): Rect[] {
  const seen = new Set<string>();
  const out: Rect[] = [];
  for (const r of rects) {
    const k = `${r.x.toFixed(1)}|${r.y.toFixed(1)}|${r.w.toFixed(1)}|${r.h.toFixed(1)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

interface GridRow {
  y: number;
  h: number;
  boxes: Rect[];
}

function findGridRows(rects: Rect[]): GridRow[] {
  // Filter to plausible character cells.
  const cells = rects.filter(
    (r) => r.w >= 4 && r.w <= 80 && r.h >= 8 && r.h <= 60,
  );
  // Sort by y (top in PDF user space = larger y; we sort descending),
  // then x ascending.
  cells.sort((a, b) => b.y - a.y || a.x - b.x);

  const used = new Set<number>();
  const rows: GridRow[] = [];

  for (let i = 0; i < cells.length; i++) {
    if (used.has(i)) continue;
    const seed = cells[i];
    const row: Rect[] = [seed];
    used.add(i);
    for (let j = i + 1; j < cells.length; j++) {
      if (used.has(j)) continue;
      const r = cells[j];
      if (Math.abs(r.y - seed.y) > Math.max(1.5, seed.h * 0.15)) continue;
      if (Math.abs(r.h - seed.h) > seed.h * 0.2) continue;
      row.push(r);
      used.add(j);
    }
    if (row.length < 3) {
      // Not a grid; release these cells so they may still appear in
      // future seeds (rare, but harmless).
      for (const r of row) used.add(cells.indexOf(r));
      continue;
    }
    row.sort((a, b) => a.x - b.x);

    // Split the row into runs of similar-width, adjacent boxes.
    let runStart = 0;
    for (let k = 1; k <= row.length; k++) {
      const start = row[runStart];
      const prev = row[k - 1];
      const next = row[k];
      const widthOk = next ? Math.abs(next.w - start.w) <= start.w * 0.2 : false;
      const gap = next ? next.x - (prev.x + prev.w) : Infinity;
      const gapOk = gap >= -1 && gap <= start.w * 0.6;
      if (!next || !widthOk || !gapOk) {
        const runLen = k - runStart;
        if (runLen >= 3) {
          const slice = row.slice(runStart, k);
          rows.push({
            y: start.y,
            h: start.h,
            boxes: slice,
          });
        }
        runStart = k;
      }
    }
  }
  return rows;
}

async function detectGrids(pdf: PDFDocumentProxy): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    let opList;
    try {
      opList = await page.getOperatorList();
    } catch {
      continue;
    }
    const ctmStack: Matrix[] = [IDENTITY.slice() as Matrix];
    const rects: Rect[] = [];

    for (let j = 0; j < opList.fnArray.length; j++) {
      const fn = opList.fnArray[j];
      const args = opList.argsArray[j];

      if (fn === OPS.save) {
        const top = ctmStack[ctmStack.length - 1];
        ctmStack.push([...top] as Matrix);
      } else if (fn === OPS.restore) {
        if (ctmStack.length > 1) ctmStack.pop();
      } else if (fn === OPS.transform) {
        const ctm = ctmStack[ctmStack.length - 1];
        const t: Matrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
        ctmStack[ctmStack.length - 1] = mul(ctm, t);
      } else if (fn === OPS.constructPath) {
        const ops = args[0] as number[];
        const coords = args[1] as number[];
        if (Array.isArray(ops) && Array.isArray(coords)) {
          extractRects(ops, coords, ctmStack[ctmStack.length - 1], rects);
        }
      }
    }

    if (!rects.length) continue;
    const unique = dedupeRects(rects);
    const rows = findGridRows(unique);
    for (const row of rows) {
      const first = row.boxes[0];
      const last = row.boxes[row.boxes.length - 1];
      const x = first.x;
      const yUser = first.y; // bottom-left of cell in PDF user space
      const width = last.x + last.w - first.x;
      const height = first.h;
      const boxCount = row.boxes.length;
      const boxWidth = width / boxCount;
      out.push({
        id: `g-${i}-${Math.round(x)}-${Math.round(yUser)}`,
        pageIndex: i,
        x,
        y: pageHeight - yUser - height,
        width,
        height,
        kind: 'grid',
        source: 'grid',
        boxCount,
        boxWidth,
        label: `Grid (${boxCount})`,
      });
    }
  }
  return out;
}

export async function detectFields(pdf: PDFDocumentProxy): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    // 1. AcroForm widget annotations (real form fields).
    const annotations = (await page.getAnnotations()) as PdfjsAnnotation[];
    for (const ann of annotations) {
      if (ann.subtype !== 'Widget' || !ann.rect || ann.readOnly) continue;
      const [rx1, ry1, rx2, ry2] = ann.rect;
      const x1 = Math.min(rx1, rx2);
      const x2 = Math.max(rx1, rx2);
      const y1 = Math.min(ry1, ry2);
      const y2 = Math.max(ry1, ry2);
      let kind: 'text' | 'signature';
      if (ann.fieldType === 'Sig') kind = 'signature';
      else if (ann.fieldType === 'Tx') kind = 'text';
      else continue;
      out.push({
        id: `w-${i}-${ann.id ?? out.length}`,
        pageIndex: i,
        x: x1,
        y: pageHeight - y2,
        width: x2 - x1,
        height: y2 - y1,
        kind,
        label: ann.fieldName,
        source: 'widget',
      });
    }

    // 2. Visual underscore lines ("________" used as fill-in blanks).
    const content = await page.getTextContent();
    const items = content.items as PdfjsTextItem[];
    for (const item of items) {
      if (!item.str || typeof item.str !== 'string') continue;
      if (!/^_{4,}\s*$/.test(item.str.trim())) {
        if (!/_{6,}/.test(item.str)) continue;
      }
      const t = item.transform;
      if (!t || t.length < 6) continue;
      const baselineX = t[4];
      const baselineY = t[5];
      const fontSize = Math.abs(t[0]) || Math.abs(t[3]) || 10;
      const width = item.width || fontSize * 6;
      // Lift the suggestion above the underscore: a text box drawn at the
      // baseline visually overlaps the line, so we shift it up by ~1.4×fontSize
      // and tighten the height so the resulting text sits cleanly above.
      const candidate = {
        id: `u-${i}-${out.length}`,
        pageIndex: i,
        x: baselineX,
        y: pageHeight - baselineY - fontSize * 1.4,
        width,
        height: fontSize * 1.1,
        kind: 'text' as const,
        source: 'underscore' as const,
      };
      const covered = out.some(
        (s) =>
          s.pageIndex === i && s.source === 'widget' && rectsOverlap(s, candidate),
      );
      if (!covered) out.push(candidate);
    }
  }

  // 3. Grid layouts (drawn rectangles in rows).
  const grids = await detectGrids(pdf);
  for (const g of grids) {
    const covered = out.some(
      (s) =>
        s.pageIndex === g.pageIndex && s.source === 'widget' && rectsOverlap(s, g),
    );
    if (!covered) out.push(g);
  }

  return out;
}
