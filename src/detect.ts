import type { PDFDocumentProxy } from "pdfjs-dist";
import { OPS } from "pdfjs-dist";
import type { Suggestion } from "./types";

interface PdfjsAnnotation {
  subtype?: string;
  rect?: number[];
  fieldType?: string;
  fieldName?: string;
  id?: string;
  readOnly?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
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

interface LineSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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

function transformRect(
  m: Matrix,
  x: number,
  y: number,
  w: number,
  h: number,
): Rect {
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
  outLines?: LineSeg[],
) {
  let idx = 0;
  // Track the current sub-path so we can detect rectangles drawn as
  // moveTo/lineTo×3/closePath (common when PDFs avoid the rectangle op).
  let pathPoints: Array<[number, number]> = [];

  const flushPath = () => {
    // Drop consecutive duplicate points and an explicit "close" point that
    // simply repeats the start (some PDFs end with lineTo(start) instead of
    // closePath, giving 5 points instead of 4).
    const distinct: Array<[number, number]> = [];
    for (const p of pathPoints) {
      const last = distinct[distinct.length - 1];
      if (!last || !near(p[0], last[0], 0.5) || !near(p[1], last[1], 0.5)) {
        distinct.push(p);
      }
    }
    while (distinct.length > 4) {
      const last = distinct[distinct.length - 1];
      const first = distinct[0];
      if (near(last[0], first[0], 0.5) && near(last[1], first[1], 0.5)) {
        distinct.pop();
      } else {
        break;
      }
    }
    if (distinct.length === 4) {
      const xs = distinct.map((p) => p[0]);
      const ys = distinct.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = maxX - minX;
      const h = maxY - minY;
      let axisAligned = true;
      for (const [px, py] of distinct) {
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
    } else if (distinct.length === 2 && outLines) {
      // Standalone line segment — could be one edge of a rect drawn as four
      // separate strokes. Save it for later combination.
      const [p1, p2] = distinct.map((pt) => transformPoint(ctm, pt[0], pt[1]));
      outLines.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] });
    }
    pathPoints = [];
  };

  for (const subop of ops) {
    if (subop === OPS.moveTo) {
      flushPath();
      const x = coords[idx++];
      const y = coords[idx++];
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

function rectsFromLineQuartets(lines: LineSeg[], out: Rect[]) {
  // Split into horizontal and vertical (with min/max normalized).
  const horiz: LineSeg[] = [];
  const vert: LineSeg[] = [];
  for (const l of lines) {
    if (near(l.y1, l.y2, 0.6)) {
      horiz.push({
        x1: Math.min(l.x1, l.x2),
        y1: l.y1,
        x2: Math.max(l.x1, l.x2),
        y2: l.y2,
      });
    } else if (near(l.x1, l.x2, 0.6)) {
      vert.push({
        x1: l.x1,
        y1: Math.min(l.y1, l.y2),
        x2: l.x2,
        y2: Math.max(l.y1, l.y2),
      });
    }
  }
  if (horiz.length < 2 || vert.length < 2) return;

  // For each pair of parallel horizontals at different y with similar x range,
  // look for two verticals connecting them at the same x extents.
  for (let i = 0; i < horiz.length; i++) {
    const a = horiz[i];
    for (let j = i + 1; j < horiz.length; j++) {
      const b = horiz[j];
      if (Math.abs(a.y1 - b.y1) < 3) continue;
      if (!near(a.x1, b.x1, 1) || !near(a.x2, b.x2, 1)) continue;
      const yBot = Math.min(a.y1, b.y1);
      const yTop = Math.max(a.y1, b.y1);
      const xLeft = (a.x1 + b.x1) / 2;
      const xRight = (a.x2 + b.x2) / 2;
      let hasLeft = false;
      let hasRight = false;
      for (const v of vert) {
        if (!near(v.y1, yBot, 1.5) || !near(v.y2, yTop, 1.5)) continue;
        if (near(v.x1, xLeft, 1)) hasLeft = true;
        if (near(v.x1, xRight, 1)) hasRight = true;
      }
      if (hasLeft && hasRight) {
        out.push({ x: xLeft, y: yBot, w: xRight - xLeft, h: yTop - yBot });
      }
    }
  }
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
      const widthOk = next
        ? Math.abs(next.w - start.w) <= start.w * 0.2
        : false;
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

async function collectPageRects(pdf: PDFDocumentProxy): Promise<Map<number, Rect[]>> {
  const result = new Map<number, Rect[]>();
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    let opList;
    try {
      opList = await page.getOperatorList();
    } catch {
      result.set(i, []);
      continue;
    }
    const ctmStack: Matrix[] = [IDENTITY.slice() as Matrix];
    const rects: Rect[] = [];
    const lines: LineSeg[] = [];

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
        const t: Matrix = [
          args[0],
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
        ];
        ctmStack[ctmStack.length - 1] = mul(ctm, t);
      } else if (fn === OPS.constructPath) {
        const ops = args[0] as number[];
        const coords = args[1] as number[];
        if (Array.isArray(ops) && Array.isArray(coords)) {
          extractRects(
            ops,
            coords,
            ctmStack[ctmStack.length - 1],
            rects,
            lines,
          );
        }
      }
    }
    rectsFromLineQuartets(lines, rects);
    result.set(i, dedupeRects(rects));
  }
  return result;
}

async function detectGrids(
  pdf: PDFDocumentProxy,
  rectsByPage: Map<number, Rect[]>,
): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const unique = rectsByPage.get(i) ?? [];
    if (!unique.length) continue;
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
        kind: "grid",
        source: "grid",
        boxCount,
        boxWidth,
        label: `Grid (${boxCount})`,
      });
    }
  }
  return out;
}

const CHECKBOX_GLYPHS = /[☐☑☒■□▢▣▪▫◻◼◽◾⬛⬜❑❒]/;

async function detectCheckboxes(
  pdf: PDFDocumentProxy,
  rectsByPage: Map<number, Rect[]>,
): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const rects = rectsByPage.get(i) ?? [];
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    // Plausible checkbox: small near-square rectangle.
    const squares = rects.filter((r) => {
      if (r.w < 4 || r.w > 24) return false;
      if (r.h < 4 || r.h > 24) return false;
      const ratio = r.w / r.h;
      return ratio >= 0.78 && ratio <= 1.28;
    });

    // Stroke + fill produces two near-coincident rects; merge them.
    const merged: Rect[] = [];
    for (const sq of squares) {
      if (
        merged.some(
          (m) =>
            Math.abs(m.x - sq.x) < 1.5 &&
            Math.abs(m.y - sq.y) < 1.5 &&
            Math.abs(m.w - sq.w) < 1.5 &&
            Math.abs(m.h - sq.h) < 1.5,
        )
      ) {
        continue;
      }
      merged.push(sq);
    }

    // Drop inner squares fully contained in a larger one (nested borders).
    const filtered = merged.filter(
      (sq) =>
        !merged.some(
          (other) =>
            other !== sq &&
            other.w > sq.w + 0.5 &&
            other.x <= sq.x + 0.5 &&
            other.y <= sq.y + 0.5 &&
            other.x + other.w >= sq.x + sq.w - 0.5 &&
            other.y + other.h >= sq.y + sq.h - 0.5,
        ),
    );

    // Pull text items so we can pair the box with a nearby label.
    const content = await page.getTextContent();
    const items = content.items as PdfjsTextItem[];
    const textItems = items
      .filter(
        (it) =>
          it.str && typeof it.str === "string" && it.str.trim().length > 0,
      )
      .map((it) => {
        const t = it.transform ?? [1, 0, 0, 1, 0, 0];
        const fontSize = Math.abs(t[0]) || Math.abs(t[3]) || 10;
        const w = it.width || fontSize * it.str.length * 0.5;
        return {
          str: it.str.trim(),
          x: t[4],
          y: t[5],
          fontSize,
          endX: t[4] + w,
        };
      });

    for (const sq of filtered) {
      const cy = sq.y + sq.h / 2;
      const sqRight = sq.x + sq.w;
      const sqLeft = sq.x;
      let label: string | undefined;
      let bestDist = Infinity;
      for (const ti of textItems) {
        // Text baseline (PDF user space) is at ti.y; visual middle is ~0.35×fontSize above.
        const textMidY = ti.y + ti.fontSize * 0.35;
        if (Math.abs(textMidY - cy) > sq.h * 0.9) continue;
        // To the right of the box.
        if (ti.x >= sqRight - 1 && ti.x - sqRight < sq.w * 5) {
          const dist = ti.x - sqRight;
          if (dist < bestDist) {
            bestDist = dist;
            label = ti.str;
          }
        }
        // To the left of the box.
        else if (ti.endX <= sqLeft + 1 && sqLeft - ti.endX < sq.w * 5) {
          const dist = sqLeft - ti.endX;
          if (dist < bestDist) {
            bestDist = dist;
            label = ti.str;
          }
        }
      }
      if (label && label.length > 40) label = label.slice(0, 37) + "...";

      out.push({
        id: `cb-${i}-${Math.round(sq.x)}-${Math.round(sq.y)}`,
        pageIndex: i,
        x: sq.x,
        y: pageHeight - sq.y - sq.h,
        width: sq.w,
        height: sq.h,
        kind: "checkbox",
        source: "checkbox",
        label,
      });
    }

    // Unicode checkbox glyphs (☐ □ ▢ ◻ ⬜ etc.) embedded in text.
    for (const ti of textItems) {
      if (!CHECKBOX_GLYPHS.test(ti.str)) continue;
      const charWidth = ti.str.length > 0 ? (ti.endX - ti.x) / ti.str.length : ti.fontSize;
      for (let p = 0; p < ti.str.length; p++) {
        if (!CHECKBOX_GLYPHS.test(ti.str[p])) continue;
        const boxSize = Math.max(8, ti.fontSize * 0.85);
        const glyphX = ti.x + p * charWidth;
        const baselineY = ti.y;
        // Center the box around where the glyph sits (cap height to baseline).
        const boxYBottom = baselineY;
        const candidate: Suggestion = {
          id: `cbg-${i}-${out.length}`,
          pageIndex: i,
          x: glyphX,
          y: pageHeight - boxYBottom - boxSize,
          width: boxSize,
          height: boxSize,
          kind: "checkbox",
          source: "checkbox",
        };
        // Use surrounding text on the same line as the label.
        const surrounding = ti.str
          .slice(0, p)
          .replace(CHECKBOX_GLYPHS, "")
          .concat(ti.str.slice(p + 1).replace(CHECKBOX_GLYPHS, ""))
          .trim();
        let label: string | undefined = surrounding || undefined;
        if (!label) {
          let bestDist = Infinity;
          for (const other of textItems) {
            if (other === ti) continue;
            if (Math.abs(other.y - baselineY) > ti.fontSize * 0.4) continue;
            if (other.x <= glyphX + charWidth) continue;
            const dist = other.x - (glyphX + charWidth);
            if (dist < bestDist && dist < ti.fontSize * 8) {
              bestDist = dist;
              label = other.str;
            }
          }
        }
        if (label && label.length > 40) label = label.slice(0, 37) + "...";
        candidate.label = label;

        // Skip if it overlaps a checkbox we already pushed (vector-drawn).
        const dup = out.some(
          (s) =>
            s.pageIndex === i &&
            s.source === "checkbox" &&
            rectsOverlap(s, candidate),
        );
        if (!dup) out.push(candidate);
      }
    }
  }
  return out;
}

export async function detectFields(
  pdf: PDFDocumentProxy,
): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  const rectsByPage = await collectPageRects(pdf);

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    // 1. AcroForm widget annotations (real form fields).
    const annotations = (await page.getAnnotations()) as PdfjsAnnotation[];
    for (const ann of annotations) {
      if (ann.subtype !== "Widget" || !ann.rect || ann.readOnly) continue;
      const [rx1, ry1, rx2, ry2] = ann.rect;
      const x1 = Math.min(rx1, rx2);
      const x2 = Math.max(rx1, rx2);
      const y1 = Math.min(ry1, ry2);
      const y2 = Math.max(ry1, ry2);
      let kind: "text" | "signature" | "checkbox";
      if (ann.fieldType === "Sig") kind = "signature";
      else if (ann.fieldType === "Tx") kind = "text";
      else if (
        ann.fieldType === "Btn" &&
        ann.checkBox === true &&
        !ann.radioButton &&
        !ann.pushButton
      ) {
        kind = "checkbox";
      } else continue;
      out.push({
        id: `w-${i}-${ann.id ?? out.length}`,
        pageIndex: i,
        x: x1,
        y: pageHeight - y2,
        width: x2 - x1,
        height: y2 - y1,
        kind,
        label: ann.fieldName,
        source: "widget",
      });
    }

    // 2. Visual underscore lines ("________" used as fill-in blanks).
    const content = await page.getTextContent();
    const items = content.items as PdfjsTextItem[];
    for (const item of items) {
      if (!item.str || typeof item.str !== "string") continue;
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
        kind: "text" as const,
        source: "underscore" as const,
      };
      const covered = out.some(
        (s) =>
          s.pageIndex === i &&
          s.source === "widget" &&
          rectsOverlap(s, candidate),
      );
      if (!covered) out.push(candidate);
    }
  }

  // 3. Grid layouts (drawn rectangles in rows).
  const grids = await detectGrids(pdf, rectsByPage);
  for (const g of grids) {
    const covered = out.some(
      (s) =>
        s.pageIndex === g.pageIndex &&
        s.source === "widget" &&
        rectsOverlap(s, g),
    );
    if (!covered) out.push(g);
  }

  // 4. Label-colon patterns ("Name:", "Email:") laid out in a grid.
  const labelHits = await detectLabelColon(pdf);
  for (const l of labelHits) {
    const covered = out.some(
      (s) => s.pageIndex === l.pageIndex && rectsOverlap(s, l),
    );
    if (!covered) out.push(l);
  }

  // 5. Visual checkbox squares paired with nearby text.
  const checkboxes = await detectCheckboxes(pdf, rectsByPage);
  for (const c of checkboxes) {
    const covered = out.some(
      (s) => s.pageIndex === c.pageIndex && rectsOverlap(s, c),
    );
    if (!covered) out.push(c);
  }

  return out;
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  endX: number;
}

function itemCharWidth(item: PositionedTextItem): number {
  return item.str.length > 0 ? item.width / item.str.length : item.fontSize * 0.5;
}

// Detects a "( )" placeholder following a colon. Returns the x range of the
// empty interior (inside the parens) if both parens are found on the same
// baseline and the content between them is whitespace. Handles three layouts:
//   - same item:    "Téléphone : ( )"
//   - paren in next item, ")" in same:  "Téléphone :" + "( )"
//   - parens in two separate items:     "Téléphone :" + "(" + ")"
function findParenPlaceholder(
  item: PositionedTextItem,
  colonPos: number,
  raw: string,
  charWidth: number,
  positioned: PositionedTextItem[],
  baselineY: number,
  fontSize: number,
  colonEndX: number,
): { startX: number; endX: number } | null {
  // 1) Same-item: "label : ( )"
  {
    let p = colonPos + 1;
    while (p < raw.length && /\s/.test(raw[p])) p++;
    if (p < raw.length && raw[p] === "(") {
      const q = raw.indexOf(")", p + 1);
      if (q > p && /^\s*$/.test(raw.slice(p + 1, q))) {
        return {
          startX: item.x + (p + 1) * charWidth,
          endX: item.x + q * charWidth,
        };
      }
    }
  }

  // 2) Cross-item: find an "(" item on the same baseline immediately after.
  let openItem: PositionedTextItem | undefined;
  let openIdx = -1;
  for (const other of positioned) {
    if (other === item) continue;
    if (Math.abs(other.y - baselineY) > fontSize * 0.4) continue;
    if (other.x <= colonEndX + 0.5) continue;
    const idx = other.str.indexOf("(");
    if (idx < 0) continue;
    if (other.str.slice(0, idx).trim().length > 0) continue;
    if (!openItem || other.x < openItem.x) {
      openItem = other;
      openIdx = idx;
    }
  }
  if (!openItem) return null;

  const openCw = itemCharWidth(openItem);
  const innerStartX = openItem.x + (openIdx + 1) * openCw;

  // 2a) ")" in the same item as "(".
  const closeInSame = openItem.str.indexOf(")", openIdx + 1);
  if (closeInSame > openIdx) {
    if (/^\s*$/.test(openItem.str.slice(openIdx + 1, closeInSame))) {
      return {
        startX: innerStartX,
        endX: openItem.x + closeInSame * openCw,
      };
    }
    return null;
  }

  // 2b) ")" in a later item on the same baseline.
  let closeItem: PositionedTextItem | undefined;
  let closeIdx = -1;
  for (const other of positioned) {
    if (other === item || other === openItem) continue;
    if (Math.abs(other.y - baselineY) > fontSize * 0.4) continue;
    if (other.x <= openItem.endX + 0.5) continue;
    const idx = other.str.indexOf(")");
    if (idx < 0) continue;
    if (!closeItem || other.x < closeItem.x) {
      closeItem = other;
      closeIdx = idx;
    }
  }
  if (!closeItem) return null;
  // Require that nothing non-whitespace sits between the two parens, either in
  // the open item after "(", or in any item between, or in the close item
  // before ")".
  if (openItem.str.slice(openIdx + 1).trim().length > 0) return null;
  if (closeItem.str.slice(0, closeIdx).trim().length > 0) return null;
  for (const other of positioned) {
    if (other === item || other === openItem || other === closeItem) continue;
    if (Math.abs(other.y - baselineY) > fontSize * 0.4) continue;
    if (other.x <= openItem.endX + 0.5) continue;
    if (other.x >= closeItem.x) continue;
    if (other.str.trim().length > 0) return null;
  }
  const closeCw = itemCharWidth(closeItem);
  return {
    startX: innerStartX,
    endX: closeItem.x + closeIdx * closeCw,
  };
}

async function detectLabelColon(pdf: PDFDocumentProxy): Promise<Suggestion[]> {
  const out: Suggestion[] = [];

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const content = await page.getTextContent();
    const items = content.items as PdfjsTextItem[];

    const positioned: PositionedTextItem[] = [];
    for (const item of items) {
      if (!item.str || typeof item.str !== "string") continue;
      if (!item.str.length) continue;
      const t = item.transform;
      if (!t || t.length < 6) continue;
      const fontSize = Math.abs(t[0]) || Math.abs(t[3]) || 10;
      const width = item.width || fontSize * item.str.length * 0.5;
      positioned.push({
        str: item.str,
        x: t[4],
        y: t[5],
        width,
        fontSize,
        endX: t[4] + width,
      });
    }

    // Sort by baseline (descending in PDF user space = top of page first),
    // then by x within a line. Lets us scan colon items and look back for
    // their label cheaply.
    const sorted = [...positioned].sort((a, b) => {
      const tol = Math.min(a.fontSize, b.fontSize) * 0.3;
      if (Math.abs(a.y - b.y) > tol) return b.y - a.y;
      return a.x - b.x;
    });

    interface LabelCandidate {
      labelText: string;
      labelX: number;
      labelEndX: number; // x just after the colon
      baselineY: number;
      fontSize: number;
      inputStart: number;
      inputEnd: number;
    }

    const candidates: LabelCandidate[] = [];
    for (let k = 0; k < sorted.length; k++) {
      const item = sorted[k];
      const raw = item.str;
      if (!raw) continue;

      // Locate every ":" in this item. pdfjs frequently merges several labels
      // on the same line into one text item (e.g. "Nom :    Prénom :"), so we
      // need to find each colon, not just the trailing one.
      const colonPositions: number[] = [];
      for (let p = 0; p < raw.length; p++) {
        if (raw[p] === ":") colonPositions.push(p);
      }
      if (colonPositions.length === 0) continue;

      const charWidth =
        raw.length > 0 ? item.width / raw.length : item.fontSize * 0.5;

      for (let ci = 0; ci < colonPositions.length; ci++) {
        const pos = colonPositions[ci];
        const sliceStart = ci === 0 ? 0 : colonPositions[ci - 1] + 1;

        // Find first non-whitespace char in the label slice for label-start X.
        let labelFirstCharIdx = sliceStart;
        while (labelFirstCharIdx < pos && /\s/.test(raw[labelFirstCharIdx])) {
          labelFirstCharIdx++;
        }
        let labelText = raw.slice(sliceStart, pos).trim();
        let labelStartX = item.x + labelFirstCharIdx * charWidth;
        const baselineY = item.y;
        const fontSize = item.fontSize;

        // Bare ":" at the very start of an item — look back for the label.
        if (!labelText && ci === 0) {
          let prev: PositionedTextItem | undefined;
          for (let m = k - 1; m >= 0; m--) {
            const cand = sorted[m];
            if (Math.abs(cand.y - item.y) > item.fontSize * 0.4) {
              prev = undefined;
              break;
            }
            if (cand.str.trim().length === 0) continue;
            prev = cand;
            break;
          }
          if (!prev) continue;
          const gap = item.x - prev.endX;
          if (gap > item.fontSize * 1.5 || gap < -1) continue;
          const prevTrim = prev.str.trim();
          if (!prevTrim || prevTrim.endsWith(":")) continue;
          // Use the last word of the previous item as the label (handles cases
          // where the previous item itself contains punctuation).
          const lastColon = prevTrim.lastIndexOf(":");
          labelText =
            lastColon >= 0 ? prevTrim.slice(lastColon + 1).trim() : prevTrim;
          labelStartX = prev.x;
        }

        if (!labelText) continue;
        if (!/[A-Za-z0-9]/.test(labelText)) continue;
        if (/^\d+$/.test(labelText)) continue;

        const colonEndX = item.x + (pos + 1) * charWidth;

        // Find where the input region ends:
        //   - next ":" within the same item ⇒ stop at its label start
        //   - non-whitespace after the colon in the same item ⇒ stop there
        //     (covers "Téléphone : ( )" where parens follow)
        //   - else next text item on the same baseline
        //   - else extend 12× font size
        let nextX = Infinity;
        if (ci + 1 < colonPositions.length) {
          let nextLabelStart = pos + 1;
          while (
            nextLabelStart < colonPositions[ci + 1] &&
            /\s/.test(raw[nextLabelStart])
          ) {
            nextLabelStart++;
          }
          nextX = item.x + nextLabelStart * charWidth;
        } else {
          let nextNonWS = pos + 1;
          while (nextNonWS < raw.length && /\s/.test(raw[nextNonWS])) {
            nextNonWS++;
          }
          if (nextNonWS < raw.length) {
            nextX = item.x + nextNonWS * charWidth;
          }
        }
        for (const other of positioned) {
          if (other === item) continue;
          if (Math.abs(other.y - baselineY) > fontSize * 0.4) continue;
          if (other.x <= colonEndX + 0.5) continue;
          if (other.x < nextX) nextX = other.x;
        }

        // Paren-placeholder override: when the text right after the colon is
        // "(...)" with empty interior (e.g. "Téléphone : ( )" for an area
        // code), use the inside of the parens as the input region rather than
        // the tiny gap between the colon and the opening paren.
        const paren = findParenPlaceholder(
          item,
          pos,
          raw,
          charWidth,
          positioned,
          baselineY,
          fontSize,
          colonEndX,
        );

        let inputStart: number;
        let inputEnd: number;
        if (paren && paren.endX - paren.startX >= fontSize * 1.0) {
          inputStart = paren.startX + fontSize * 0.15;
          inputEnd = paren.endX - fontSize * 0.15;
        } else {
          inputStart = colonEndX + fontSize * 0.3;
          inputEnd =
            nextX !== Infinity
              ? nextX - fontSize * 0.3
              : colonEndX + fontSize * 12;
        }
        if (inputEnd - inputStart < fontSize * 1.0) continue;

        candidates.push({
          labelText,
          labelX: labelStartX,
          labelEndX: colonEndX,
          baselineY,
          fontSize,
          inputStart,
          inputEnd,
        });
      }
    }

    // Grid alignment: accept candidates that share a column (similar label
    // start x), a row (similar baseline), or an input column (similar inputStart,
    // common when right-aligned colons make the writing area line up) with at
    // least one other candidate. Lone "Re:" in a paragraph won't have a buddy.
    for (const c of candidates) {
      const hasBuddy = candidates.some((o) => {
        if (o === c) return false;
        if (Math.abs(o.labelX - c.labelX) <= c.fontSize * 0.5) return true;
        if (Math.abs(o.labelEndX - c.labelEndX) <= c.fontSize * 0.5)
          return true;
        if (Math.abs(o.inputStart - c.inputStart) <= c.fontSize * 0.5)
          return true;
        if (Math.abs(o.baselineY - c.baselineY) <= c.fontSize * 0.3)
          return true;
        return false;
      });
      if (!hasBuddy) continue;

      // Position the annotation so that its visual text baseline aligns with
      // the label's baseline. The annotation div renders text with line-height
      // 1.2 in a height of ~fontSize, putting the rendered baseline ≈ 0.85×
      // fontSize below the div top — so the div top sits at cap-top of the label.
      out.push({
        id: `lc-${i}-${out.length}`,
        pageIndex: i,
        x: c.inputStart,
        y: pageHeight - c.baselineY - c.fontSize * 0.85,
        width: c.inputEnd - c.inputStart,
        height: c.fontSize,
        kind: "text",
        source: "label",
        label: c.labelText,
      });
    }
  }

  return out;
}
