import { forwardRef, useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, RenderedPage, Tool } from './types';
import { AnnotationView } from './AnnotationView';

interface Props {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  tool: Tool;
  pendingSignature: string | null;
  annotations: Annotation[];
  selectedId: string | null;
  onRendered: (info: RenderedPage) => void;
  onPagePointerDown: (pageIndex: number, xPt: number, yPt: number) => void;
  onAnnotationChange: (a: Annotation) => void;
  onAnnotationSelect: (id: string | null) => void;
}

export const PdfPage = forwardRef<HTMLDivElement, Props>(function PdfPage(
  {
    pdf,
    pageIndex,
    scale,
    tool,
    pendingSignature,
    annotations,
    selectedId,
    onRendered,
    onPagePointerDown,
    onAnnotationChange,
    onAnnotationSelect,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = page.render({ canvasContext: ctx, viewport });
      renderTask = task;
      try {
        await task.promise;
      } catch (err) {
        if (cancelled) return;
        throw err;
      }
      if (cancelled) return;
      const ptViewport = page.getViewport({ scale: 1 });
      onRendered({
        pageIndex,
        widthPt: ptViewport.width,
        heightPt: ptViewport.height,
      });
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageIndex, scale, onRendered]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== overlayRef.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const xPt = (e.clientX - rect.left) / scale;
    const yPt = (e.clientY - rect.top) / scale;
    onPagePointerDown(pageIndex, xPt, yPt);
  };

  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  const overlayClass = [
    'overlay',
    tool === 'text' ? 'placing-text' : '',
    pendingSignature ? 'placing-signature' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="page" ref={ref} data-page-index={pageIndex}>
      <canvas ref={canvasRef} />
      <div
        ref={overlayRef}
        className={overlayClass}
        onPointerDown={handlePointerDown}
      >
        {pageAnnotations.map((a) => (
          <AnnotationView
            key={a.id}
            annotation={a}
            scale={scale}
            selected={a.id === selectedId}
            onChange={onAnnotationChange}
            onSelect={onAnnotationSelect}
          />
        ))}
      </div>
    </div>
  );
});
