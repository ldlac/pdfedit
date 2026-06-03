import { useRef } from 'react';
import SignatureCanvasImport from 'react-signature-canvas';

// react-signature-canvas 1.0.7 is a CJS UMD bundle. Under Vite/Rolldown the
// default import sometimes resolves to the wrapper object `{ default: Class }`
// instead of the class itself, which makes React complain that the element
// type is invalid. Unwrap it at runtime; keep the class type for the ref.
type SignaturePadRef = SignatureCanvasImport;
const SignatureCanvas = ((SignatureCanvasImport as unknown as {
  default?: typeof SignatureCanvasImport;
}).default ?? SignatureCanvasImport) as typeof SignatureCanvasImport;

interface Props {
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}

export function SignaturePadModal({ onCancel, onSave }: Props) {
  const padRef = useRef<SignaturePadRef>(null);

  const handleSave = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    const trimmed = pad.getTrimmedCanvas();
    onSave(trimmed.toDataURL('image/png'));
  };

  return (
    <div className="modal-backdrop" onPointerDown={onCancel}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Draw your signature</h2>
        <p className="modal-sub">
          Use your mouse, trackpad, or touch. Click "Use signature" to place it on
          the page.
        </p>
        <div className="sig-canvas-wrap">
          <SignatureCanvas
            ref={padRef}
            penColor="#111"
            minWidth={1}
            maxWidth={2.5}
            canvasProps={{ className: 'sig-canvas' }}
          />
          <div className="sig-baseline" />
        </div>
        <div className="modal-actions">
          <button className="btn bordered" onClick={() => padRef.current?.clear()}>
            Clear
          </button>
          <button className="btn bordered" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave}>
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
