import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface Props {
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}

export function SignaturePadModal({ onCancel, onSave }: Props) {
  const padRef = useRef<SignatureCanvas>(null);

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
        <div className="sig-canvas-wrap">
          <SignatureCanvas
            ref={padRef}
            penColor="#111"
            canvasProps={{ className: 'sig-canvas' }}
          />
        </div>
        <div className="modal-actions">
          <button onClick={() => padRef.current?.clear()}>Clear</button>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={handleSave}>
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
