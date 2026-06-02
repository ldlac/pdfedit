import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, RenderedPage, Tool } from './types';
import { AnnotationView } from './AnnotationView';

interface Props {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  tool: Tool;
  annotations: Annotation[];
  selectedId: string | null;
  onRendered: (info: RenderedPage) => void;
  onPagePointerDown: (
    pageIndex: number,
    xCss: number,
    yCss: number,
    target: EventTarget | null,
  ) => void;
  onAnnotationChange: (a: Annotation) => void;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationDelete: (id: string) => void;
}

export function PdfPage({
  pdf,
  pageIndex,
  scale,
  tool,
  annotations,
  selectedId,
  onRendered,
  onPagePointerDown,
  onAnnotationChange,
  onAnnotationSelect,
  onAnnotationDelete,
}: Props) {
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
        widthPx: Math.floor(viewport.width),
        heightPx: Math.floor(viewport.height),
        widthPt: ptViewport.width,
        heightPt: ptViewport.height,
        scale,
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
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    onPagePointerDown(pageIndex, xCss, yCss, e.target);
  };

  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  return (
    <div className="page">
      <canvas ref={canvasRef} />
      <div
        ref={overlayRef}
        className={`overlay ${tool === 'text' ? 'placing-text' : ''}`}
        onPointerDown={handlePointerDown}
      >
        {pageAnnotations.map((a) => (
          <AnnotationView
            key={a.id}
            annotation={a}
            selected={a.id === selectedId}
            onChange={onAnnotationChange}
            onSelect={onAnnotationSelect}
            onDelete={onAnnotationDelete}
          />
        ))}
      </div>
    </div>
  );
}
