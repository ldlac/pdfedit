import { useEffect, useRef, useState } from 'react';
import type { Annotation, GridTextAnnotation } from './types';

interface Props {
  annotation: Annotation;
  scale: number;
  selected: boolean;
  onChange: (a: Annotation) => void;
  onSelect: (id: string | null) => void;
}

type DragState =
  | { kind: 'move'; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: 'resize';
      startX: number;
      startY: number;
      origW: number;
      origH: number;
      aspect: number | null;
    }
  | null;

export function AnnotationView({
  annotation,
  scale,
  selected,
  onChange,
  onSelect,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [drag, setDrag] = useState<DragState>(null);

  useEffect(() => {
    if (annotation.type !== 'text') return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [annotation, scale]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      if (drag.kind === 'move') {
        onChange({
          ...annotation,
          x: Math.max(0, drag.origX + dx),
          y: Math.max(0, drag.origY + dy),
        });
      } else {
        let w = Math.max(8, drag.origW + dx);
        let h = Math.max(8, drag.origH + dy);
        if (drag.aspect) {
          h = w / drag.aspect;
        }
        onChange({ ...annotation, width: w, height: h });
      }
    };
    const handleUp = () => setDrag(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [drag, annotation, onChange, scale]);

  const startMove = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
    if (target.classList.contains('resize-handle')) return;
    e.stopPropagation();
    onSelect(annotation.id);
    setDrag({
      kind: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origX: annotation.x,
      origY: annotation.y,
    });
  };

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    setDrag({
      kind: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      origW: annotation.width,
      origH: annotation.height,
      aspect:
        annotation.type === 'signature'
          ? annotation.width / annotation.height
          : null,
    });
  };

  const style: React.CSSProperties = {
    left: annotation.x * scale,
    top: annotation.y * scale,
    width: annotation.width * scale,
    height: annotation.type === 'text' ? 'auto' : annotation.height * scale,
    minHeight: annotation.type === 'text' ? annotation.height * scale : undefined,
  };

  if (annotation.type === 'text') {
    return (
      <div
        className={`annotation text ${selected ? 'selected' : ''}`}
        style={{
          ...style,
          fontSize: annotation.fontSize * scale,
          color: annotation.color,
        }}
        onPointerDown={startMove}
      >
        <textarea
          ref={textareaRef}
          value={annotation.text}
          placeholder="Type here"
          onChange={(e) => {
            onChange({ ...annotation, text: e.target.value });
            const ta = e.target;
            ta.style.height = 'auto';
            ta.style.height = `${ta.scrollHeight}px`;
          }}
          onFocus={() => onSelect(annotation.id)}
          rows={1}
        />
      </div>
    );
  }

  if (annotation.type === 'grid') {
    return (
      <GridAnnotationView
        annotation={annotation}
        scale={scale}
        selected={selected}
        style={style}
        startMove={startMove}
        onChange={onChange}
        onSelect={onSelect}
      />
    );
  }

  return (
    <div
      className={`annotation signature ${selected ? 'selected' : ''}`}
      style={style}
      onPointerDown={startMove}
    >
      <img src={annotation.dataUrl} alt="signature" draggable={false} />
      <span className="resize-handle" onPointerDown={startResize} />
    </div>
  );
}

interface GridProps {
  annotation: GridTextAnnotation;
  scale: number;
  selected: boolean;
  style: React.CSSProperties;
  startMove: (e: React.PointerEvent) => void;
  onChange: (a: Annotation) => void;
  onSelect: (id: string | null) => void;
}

function GridAnnotationView({
  annotation,
  scale,
  selected,
  style,
  startMove,
  onChange,
  onSelect,
}: GridProps) {
  const boxWidthPx = annotation.boxWidth * scale;
  const fontSizePx = annotation.fontSize * scale;
  return (
    <div
      className={`annotation grid ${selected ? 'selected' : ''}`}
      style={style}
      onPointerDown={startMove}
    >
      <div
        className="grid-cells"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${annotation.boxCount}, ${boxWidthPx}px)`,
          height: '100%',
        }}
      >
        {Array.from({ length: annotation.boxCount }, (_, i) => (
          <div
            key={i}
            className="grid-cell"
            style={{ fontSize: fontSizePx, color: annotation.color }}
          >
            {annotation.text[i] ?? ''}
          </div>
        ))}
      </div>
      <input
        className="grid-input"
        value={annotation.text}
        maxLength={annotation.boxCount}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={() => onSelect(annotation.id)}
        onChange={(e) =>
          onChange({ ...annotation, text: e.target.value.slice(0, annotation.boxCount) })
        }
      />
    </div>
  );
}
