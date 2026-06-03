import { Icon } from './Icon';
import type { Annotation } from './types';

const TEXT_COLORS = ['#111111', '#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea'];

interface Props {
  annotation: Annotation | null;
  onChange: (a: Annotation) => void;
  onDelete: (id: string) => void;
}

export function PropertiesPanel({ annotation, onChange, onDelete }: Props) {
  if (!annotation) {
    return (
      <aside className="sidebar">
        <div className="sidebar-empty">
          <Icon name="cursor" className="icon-lg" />
          Select an annotation to edit its properties, or use the toolbar to add
          one.
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <h3>
        <Icon name={annotation.type === 'text' ? 'text' : 'signature'} />
        {annotation.type === 'text' ? 'Text' : 'Signature'} properties
      </h3>

      {annotation.type === 'text' && (
        <>
          <div className="field">
            <label htmlFor="text-content">Content</label>
            <textarea
              id="text-content"
              value={annotation.text}
              onChange={(e) => onChange({ ...annotation, text: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Font size: {annotation.fontSize}pt</label>
            <input
              type="range"
              min={6}
              max={48}
              step={1}
              value={annotation.fontSize}
              onChange={(e) =>
                onChange({ ...annotation, fontSize: Number(e.target.value) })
              }
            />
          </div>

          <div className="field">
            <label>Color</label>
            <div className="row">
              <input
                type="color"
                value={annotation.color}
                onChange={(e) => onChange({ ...annotation, color: e.target.value })}
              />
              <div className="swatches">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${annotation.color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => onChange({ ...annotation, color: c })}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {annotation.type === 'signature' && (
        <div className="field">
          <label>Width: {Math.round(annotation.width)}pt</label>
          <input
            type="range"
            min={40}
            max={500}
            step={5}
            value={Math.round(annotation.width)}
            onChange={(e) => {
              const w = Number(e.target.value);
              const aspect = annotation.width / annotation.height;
              onChange({ ...annotation, width: w, height: w / aspect });
            }}
          />
        </div>
      )}

      <div className="field">
        <label>Position</label>
        <div className="row">
          <input
            type="number"
            value={Math.round(annotation.x)}
            onChange={(e) => onChange({ ...annotation, x: Number(e.target.value) })}
            aria-label="x"
          />
          <input
            type="number"
            value={Math.round(annotation.y)}
            onChange={(e) => onChange({ ...annotation, y: Number(e.target.value) })}
            aria-label="y"
          />
        </div>
      </div>

      <div className="actions">
        <button
          className="btn bordered danger"
          onClick={() => onDelete(annotation.id)}
        >
          <Icon name="trash" />
          Delete
        </button>
      </div>
    </aside>
  );
}
