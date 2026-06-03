import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from './pdfjs-setup';
import { PdfPage } from './PdfPage';
import { SignaturePadModal } from './SignaturePadModal';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { EmptyState } from './EmptyState';
import { Toast } from './Toast';
import { downloadBlob, exportPdf } from './export';
import { detectFields } from './detect';
import type { Annotation, RenderedPage, Suggestion, Tool } from './types';

const DEFAULT_SCALE = 1.5;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [currentPage, setCurrentPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const pagesRef = useRef<Map<number, RenderedPage>>(new Map());
  const viewerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const selectedAnnotation = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const loadFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const pdfBytesCopy = buf.slice(0);
    const exportCopy = buf.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytesCopy });
    const doc = await loadingTask.promise;
    pagesRef.current = new Map();
    pageElsRef.current = new Map();
    setAnnotations([]);
    setSelectedId(null);
    setTool(null);
    setPendingSignature(null);
    setPendingPlacement(null);
    setSuggestions([]);
    setCurrentPage(0);
    setPdfBytes(exportCopy);
    setPdfDoc(doc);
    setFileName(file.name);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = '';
  };

  const pickFile = () => fileInputRef.current?.click();

  const handleRendered = useCallback((info: RenderedPage) => {
    pagesRef.current.set(info.pageIndex, info);
  }, []);

  const handlePagePointerDown = useCallback(
    (pageIndex: number, xPt: number, yPt: number) => {
      if (tool === 'text') {
        const newAnn: Annotation = {
          id: uid(),
          type: 'text',
          pageIndex,
          x: xPt,
          y: yPt,
          width: 120,
          height: 18,
          text: '',
          fontSize: 14,
          color: '#111111',
        };
        setAnnotations((prev) => [...prev, newAnn]);
        setSelectedId(newAnn.id);
        setTool(null);
        return;
      }
      if (pendingSignature) {
        const img = new Image();
        img.onload = () => {
          const aspect = img.width / img.height || 2;
          const width = 160;
          const height = width / aspect;
          const newAnn: Annotation = {
            id: uid(),
            type: 'signature',
            pageIndex,
            x: Math.max(0, xPt - width / 2),
            y: Math.max(0, yPt - height / 2),
            width,
            height,
            dataUrl: pendingSignature,
          };
          setAnnotations((prev) => [...prev, newAnn]);
          setSelectedId(newAnn.id);
          setPendingSignature(null);
        };
        img.src = pendingSignature;
        return;
      }
      setSelectedId(null);
    },
    [tool, pendingSignature],
  );

  const handleAnnotationChange = useCallback((a: Annotation) => {
    setAnnotations((prev) => prev.map((x) => (x.id === a.id ? a : x)));
  }, []);

  const handleAnnotationDelete = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((x) => x.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSignatureSave = (dataUrl: string) => {
    setShowSigPad(false);
    setTool(null);
    if (pendingPlacement) {
      const img = new Image();
      const placement = pendingPlacement;
      img.onload = () => {
        const aspect = img.width / img.height || 2;
        let { width, height } = placement;
        if (width / height > aspect) {
          width = height * aspect;
        } else {
          height = width / aspect;
        }
        const newAnn: Annotation = {
          id: uid(),
          type: 'signature',
          pageIndex: placement.pageIndex,
          x: placement.x + (placement.width - width) / 2,
          y: placement.y + (placement.height - height) / 2,
          width,
          height,
          dataUrl,
        };
        setAnnotations((prev) => [...prev, newAnn]);
        setSelectedId(newAnn.id);
        setPendingPlacement(null);
        setSuggestions((prev) =>
          prev.filter(
            (s) =>
              !(
                s.pageIndex === placement.pageIndex &&
                Math.abs(s.x - placement.x) < 0.5 &&
                Math.abs(s.y - placement.y) < 0.5
              ),
          ),
        );
      };
      img.src = dataUrl;
      return;
    }
    setPendingSignature(dataUrl);
  };

  const handleDetect = async () => {
    if (!pdfDoc) return;
    setDetecting(true);
    try {
      const found = await detectFields(pdfDoc);
      setSuggestions(found);
      setShowSuggestions(true);
      setToast(found.length ? `Found ${found.length} field${found.length > 1 ? 's' : ''}` : 'No fields detected');
    } finally {
      setDetecting(false);
    }
  };

  const handleSuggestionClick = (s: Suggestion) => {
    if (s.kind === 'signature') {
      setPendingPlacement({
        pageIndex: s.pageIndex,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
      });
      setShowSigPad(true);
      return;
    }
    if (s.kind === 'grid' && s.boxCount && s.boxWidth) {
      const fontSize = Math.max(8, Math.min(s.height * 0.65, s.boxWidth * 0.85));
      const newAnn: Annotation = {
        id: uid(),
        type: 'grid',
        pageIndex: s.pageIndex,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        text: '',
        fontSize,
        color: '#111111',
        boxCount: s.boxCount,
        boxWidth: s.boxWidth,
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setSelectedId(newAnn.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      return;
    }
    // Plain text suggestion.
    const fontSize = Math.max(8, Math.min(24, s.height * 0.7));
    const newAnn: Annotation = {
      id: uid(),
      type: 'text',
      pageIndex: s.pageIndex,
      x: s.x + 2,
      y: s.y + (s.height - fontSize) / 2,
      width: Math.max(60, s.width - 4),
      height: fontSize,
      text: '',
      fontSize,
      color: '#111111',
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(newAnn.id);
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
  };

  const handleSave = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    try {
      const clone = pdfBytes.slice(0);
      const out = await exportPdf(clone, annotations);
      const outName = (fileName ?? 'document.pdf').replace(/\.pdf$/i, '') + '-edited.pdf';
      downloadBlob(out, outName);
      setToast('Saved');
    } finally {
      setExporting(false);
    }
  };

  // Zoom helpers
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const zoomReset = () => setScale(DEFAULT_SCALE);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;

      if (e.key === 'Escape') {
        setTool(null);
        setPendingSignature(null);
        setPendingPlacement(null);
        setSelectedId(null);
        if (isEditable) (target as HTMLElement).blur();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditable && selectedId) {
        e.preventDefault();
        handleAnnotationDelete(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, handleAnnotationDelete]);

  // Track which page is most visible for the page readout.
  useLayoutEffect(() => {
    if (!pdfDoc) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    let raf = 0;
    const update = () => {
      let bestIdx = 0;
      let bestVisible = 0;
      const viewerRect = viewer.getBoundingClientRect();
      pageElsRef.current.forEach((el, idx) => {
        const r = el.getBoundingClientRect();
        const visible =
          Math.max(0, Math.min(r.bottom, viewerRect.bottom) - Math.max(r.top, viewerRect.top));
        if (visible > bestVisible) {
          bestVisible = visible;
          bestIdx = idx;
        }
      });
      setCurrentPage(bestIdx);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    viewer.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      viewer.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pdfDoc]);

  // Drag-and-drop file open
  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      setDragOver(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type === 'application/pdf');
    if (file) void loadFile(file);
  };

  const numPages = pdfDoc?.numPages ?? 0;

  return (
    <div className="app">
      <Toolbar
        fileName={fileName}
        hasDoc={!!pdfDoc}
        tool={tool}
        exporting={exporting}
        detecting={detecting}
        suggestionCount={suggestions.length}
        showSuggestions={showSuggestions}
        scale={scale}
        currentPage={currentPage}
        numPages={numPages}
        onPickFile={pickFile}
        onSelectTool={(t) => {
          setTool(t);
          setPendingSignature(null);
          setPendingPlacement(null);
        }}
        onOpenSignaturePad={() => {
          setPendingPlacement(null);
          setShowSigPad(true);
        }}
        onDetect={handleDetect}
        onToggleSuggestions={() => setShowSuggestions((v) => !v)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        onSave={handleSave}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      <div className="body">
        <div
          ref={viewerRef}
          className={`viewer ${dragOver ? 'drop-target' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {!pdfDoc && <EmptyState onPick={pickFile} hover={dragOver} />}
          {pdfDoc &&
            Array.from({ length: pdfDoc.numPages }, (_, i) => (
              <div
                key={`${fileName ?? 'doc'}-${i}`}
                ref={(el) => {
                  if (el) pageElsRef.current.set(i, el);
                  else pageElsRef.current.delete(i);
                }}
              >
                <PdfPage
                  pdf={pdfDoc}
                  pageIndex={i}
                  scale={scale}
                  tool={tool}
                  pendingSignature={pendingSignature}
                  annotations={annotations}
                  suggestions={suggestions}
                  showSuggestions={showSuggestions}
                  selectedId={selectedId}
                  onRendered={handleRendered}
                  onPagePointerDown={handlePagePointerDown}
                  onAnnotationChange={handleAnnotationChange}
                  onAnnotationSelect={setSelectedId}
                  onSuggestionClick={handleSuggestionClick}
                />
              </div>
            ))}
        </div>

        {pdfDoc && (
          <PropertiesPanel
            annotation={selectedAnnotation}
            onChange={handleAnnotationChange}
            onDelete={handleAnnotationDelete}
          />
        )}
      </div>

      {showSigPad && (
        <SignaturePadModal
          onCancel={() => setShowSigPad(false)}
          onSave={handleSignatureSave}
        />
      )}

      {pendingSignature && (
        <div className="placement-hint">
          Click anywhere on a page to place your signature. Press Esc to cancel.
        </div>
      )}

      {tool === 'text' && (
        <div className="placement-hint">
          Click on the page to drop a text box. Press Esc to cancel.
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
