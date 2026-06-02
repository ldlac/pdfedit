import { useCallback, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from './pdfjs-setup';
import { PdfPage } from './PdfPage';
import { SignaturePadModal } from './SignaturePadModal';
import { downloadBlob, exportPdf } from './export';
import type { Annotation, RenderedPage, Tool } from './types';

const RENDER_SCALE = 1.5;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('document.pdf');
  const [tool, setTool] = useState<Tool>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pagesRef = useRef<Map<number, RenderedPage>>(new Map());

  const loadFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    // pdfjs consumes the buffer; keep a copy for export.
    const pdfBytesCopy = buf.slice(0);
    const exportCopy = buf.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytesCopy });
    const doc = await loadingTask.promise;
    pagesRef.current = new Map();
    setAnnotations([]);
    setSelectedId(null);
    setTool(null);
    setPdfBytes(exportCopy);
    setPdfDoc(doc);
    setFileName(file.name);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = '';
  };

  const handleRendered = useCallback((info: RenderedPage) => {
    pagesRef.current.set(info.pageIndex, info);
  }, []);

  const handlePagePointerDown = useCallback(
    (pageIndex: number, xCss: number, yCss: number) => {
      if (tool === 'text') {
        const newAnn: Annotation = {
          id: uid(),
          type: 'text',
          pageIndex,
          x: xCss,
          y: yCss,
          width: 160,
          height: 24,
          text: '',
          fontSize: 16,
          color: '#111111',
        };
        setAnnotations((prev) => [...prev, newAnn]);
        setSelectedId(newAnn.id);
        setTool(null);
      } else {
        setSelectedId(null);
      }
    },
    [tool],
  );

  const handleAnnotationChange = useCallback((a: Annotation) => {
    setAnnotations((prev) => prev.map((x) => (x.id === a.id ? a : x)));
  }, []);

  const handleAnnotationDelete = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((x) => x.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSignatureSave = (dataUrl: string) => {
    setShowSignature(false);
    if (!pdfDoc) return;
    const firstPage = pagesRef.current.get(0);
    if (!firstPage) return;
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height || 2;
      const width = 220;
      const height = width / ratio;
      const newAnn: Annotation = {
        id: uid(),
        type: 'signature',
        pageIndex: 0,
        x: Math.max(0, (firstPage.widthPx - width) / 2),
        y: Math.max(0, firstPage.heightPx - height - 60),
        width,
        height,
        dataUrl,
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setSelectedId(newAnn.id);
    };
    img.src = dataUrl;
  };

  const handleSave = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    try {
      // pdf-lib consumes the buffer; clone before passing.
      const clone = pdfBytes.slice(0);
      const out = await exportPdf(clone, annotations, pagesRef.current);
      const outName = fileName.replace(/\.pdf$/i, '') + '-edited.pdf';
      downloadBlob(out, outName);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <div className="toolbar">
        <label className="file">
          Open PDF
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </label>
        <button
          className={tool === 'text' ? 'active' : ''}
          disabled={!pdfDoc}
          onClick={() => setTool(tool === 'text' ? null : 'text')}
        >
          Add text
        </button>
        <button
          disabled={!pdfDoc}
          onClick={() => setShowSignature(true)}
        >
          Add signature
        </button>
        <span className="spacer" />
        {tool === 'text' && (
          <span className="hint">Click on the page where text should go.</span>
        )}
        <button
          disabled={!pdfDoc || exporting}
          onClick={handleSave}
        >
          {exporting ? 'Saving…' : 'Save PDF'}
        </button>
      </div>

      <div className="viewer">
        {!pdfDoc && (
          <div className="empty">
            Open a PDF to start editing. You can add text and a drawn signature,
            then save the result.
          </div>
        )}
        {pdfDoc &&
          Array.from({ length: pdfDoc.numPages }, (_, i) => (
            <PdfPage
              key={i}
              pdf={pdfDoc}
              pageIndex={i}
              scale={RENDER_SCALE}
              tool={tool}
              annotations={annotations}
              selectedId={selectedId}
              onRendered={handleRendered}
              onPagePointerDown={handlePagePointerDown}
              onAnnotationChange={handleAnnotationChange}
              onAnnotationSelect={setSelectedId}
              onAnnotationDelete={handleAnnotationDelete}
            />
          ))}
      </div>

      {showSignature && (
        <SignaturePadModal
          onCancel={() => setShowSignature(false)}
          onSave={handleSignatureSave}
        />
      )}
    </div>
  );
}
