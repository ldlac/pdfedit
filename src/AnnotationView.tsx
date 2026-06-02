import { useEffect, useRef, useState } from 'react';
import type { Annotation } from './types';

interface Props {
  annotation: Annotation;
  selected: boolean;
  onChange: (a: Annotation) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
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
  selected,
  onChange,
  onSelect,
  onDelete,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [drag, setDrag] = useState<DragState>(null);

  useEffect(() => {
    if (annotation.type !== 'text') return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [annotation]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (drag.kind === 'move') {
        onChange({
          ...annotation,
          x: Math.max(0, drag.origX + dx),
          y: Math.max(0, drag.origY + dy),
        });
      } else {
        let w = Math.max(20, drag.origW + dx);
        let h = Math.max(20, drag.origH + dy);
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
  }, [drag, annotation, onChange]);

  const startMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
    if ((e.target as HTMLElement).classList.contains('delete-btn')) return;
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
    left: annotation.x,
    top: annotation.y,
    width: annotation.width,
    height: annotation.type === 'text' ? 'auto' : annotation.height,
    minHeight: annotation.type === 'text' ? annotation.height : undefined,
  };

  if (annotation.type === 'text') {
    return (
      <div
        ref={elRef}
        className={`annotation text ${selected ? 'selected' : ''}`}
        style={{ ...style, fontSize: annotation.fontSize, color: annotation.color }}
        onPointerDown={startMove}
      >
        <textarea
          ref={textareaRef}
          value={annotation.text}
          placeholder="Type here…"
          onChange={(e) => {
            onChange({ ...annotation, text: e.target.value });
            const ta = e.target;
            ta.style.height = 'auto';
            ta.style.height = `${ta.scrollHeight}px`;
          }}
          onFocus={() => onSelect(annotation.id)}
          rows={1}
        />
        <button
          className="delete-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(annotation.id)}
          aria-label="Delete"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      className={`annotation signature ${selected ? 'selected' : ''}`}
      style={style}
      onPointerDown={startMove}
    >
      <img src={annotation.dataUrl} alt="signature" draggable={false} />
      <span className="resize-handle" onPointerDown={startResize} />
      <button
        className="delete-btn"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDelete(annotation.id)}
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  );
}
