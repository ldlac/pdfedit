import { forwardRef, useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, RenderedPage, Suggestion, Tool } from './types';
import { AnnotationView } from './AnnotationView';
import { Icon } from './Icon';

interface Props {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  tool: Tool;
  pendingSignature: string | null;
  annotations: Annotation[];
  suggestions: Suggestion[];
  showSuggestions: boolean;
  selectedId: string | null;
  onRendered: (info: RenderedPage) => void;
  onPagePointerDown: (pageIndex: number, xPt: number, yPt: number) => void;
  onAnnotationChange: (a: Annotation) => void;
  onAnnotationSelect: (id: string | null) => void;
  onSuggestionClick: (s: Suggestion) => void;
}

export const PdfPage = forwardRef<HTMLDivElement, Props>(function PdfPage(
  {
    pdf,
    pageIndex,
    scale,
    tool,
    pendingSignature,
    annotations,
    suggestions,
    showSuggestions,
    selectedId,
    onRendered,
    onPagePointerDown,
    onAnnotationChange,
    onAnnotationSelect,
    onSuggestionClick,
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
  const pageSuggestions = showSuggestions
    ? suggestions.filter((s) => s.pageIndex === pageIndex)
    : [];

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
        {pageSuggestions.map((s) => {
          const iconName =
            s.kind === 'signature'
              ? 'signature'
              : s.kind === 'grid'
                ? 'wand'
                : s.kind === 'checkbox'
                  ? 'check'
                  : 'text';
          const defaultLabel =
            s.kind === 'signature'
              ? 'Sign here'
              : s.kind === 'grid'
                ? `Grid (${s.boxCount})`
                : s.kind === 'checkbox'
                  ? s.label ?? 'Checkbox'
                  : 'Text';
          const title =
            s.kind === 'signature'
              ? `Click to sign${s.label ? ` (${s.label})` : ''}`
              : s.kind === 'grid'
                ? `Click to fill ${s.boxCount} boxes`
                : s.kind === 'checkbox'
                  ? `Click to check${s.label ? ` (${s.label})` : ''}`
                  : `Click to add text${s.label ? ` (${s.label})` : ''}`;
          return (
            <button
              key={s.id}
              type="button"
              className={`suggestion ${s.kind} ${s.source}`}
              style={{
                left: s.x * scale,
                top: s.y * scale,
                width: s.width * scale,
                height: s.height * scale,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSuggestionClick(s)}
              title={title}
            >
              <span className="suggestion-tag">
                <Icon name={iconName} />
                {s.label ?? defaultLabel}
              </span>
            </button>
          );
        })}
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
