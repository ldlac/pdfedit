import { Icon } from './Icon';
import type { Tool } from './types';

interface Props {
  fileName: string | null;
  hasDoc: boolean;
  tool: Tool;
  exporting: boolean;
  detecting: boolean;
  suggestionCount: number;
  showSuggestions: boolean;
  scale: number;
  currentPage: number;
  numPages: number;
  onPickFile: () => void;
  onSelectTool: (t: Tool) => void;
  onOpenSignaturePad: () => void;
  onDetect: () => void;
  onToggleSuggestions: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onSave: () => void;
}

export function Toolbar({
  fileName,
  hasDoc,
  tool,
  exporting,
  detecting,
  suggestionCount,
  showSuggestions,
  scale,
  currentPage,
  numPages,
  onPickFile,
  onSelectTool,
  onOpenSignaturePad,
  onDetect,
  onToggleSuggestions,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSave,
}: Props) {
  return (
    <div className="toolbar">
      <div className="group">
        <button className="btn bordered" onClick={onPickFile}>
          <Icon name="file" />
          Open PDF
        </button>
        {fileName && <span className="file-name" title={fileName}>{fileName}</span>}
      </div>

      <div className="divider" />

      <div className="group">
        <button
          className={`btn ${tool === 'text' ? 'active' : ''}`}
          disabled={!hasDoc}
          onClick={() => onSelectTool(tool === 'text' ? null : 'text')}
          title="Add text (click on the page where it should go)"
        >
          <Icon name="text" />
          Text
        </button>
        <button
          className="btn"
          disabled={!hasDoc}
          onClick={onOpenSignaturePad}
          title="Draw a signature and click to place it"
        >
          <Icon name="signature" />
          Signature
        </button>
        <button
          className="btn"
          disabled={!hasDoc || detecting}
          onClick={onDetect}
          title="Detect form fields and fill-in lines"
        >
          <Icon name="wand" />
          {detecting ? 'Detecting…' : 'Detect fields'}
        </button>
        {suggestionCount > 0 && (
          <button
            className={`btn ${showSuggestions ? 'active' : ''}`}
            onClick={onToggleSuggestions}
            title={showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
          >
            <Icon name={showSuggestions ? 'eye' : 'eye-off'} />
            {suggestionCount} found
          </button>
        )}
      </div>

      <div className="spacer" />

      {hasDoc && numPages > 0 && (
        <div className="page-readout" aria-label="page">
          {currentPage + 1} / {numPages}
        </div>
      )}

      <div className="divider" />

      <div className="group">
        <button
          className="btn icon-only"
          disabled={!hasDoc}
          onClick={onZoomOut}
          title="Zoom out"
        >
          <Icon name="minus" />
        </button>
        <button
          className="btn"
          disabled={!hasDoc}
          onClick={onZoomReset}
          title="Reset zoom"
        >
          <span className="zoom-readout">{Math.round(scale * 100)}%</span>
        </button>
        <button
          className="btn icon-only"
          disabled={!hasDoc}
          onClick={onZoomIn}
          title="Zoom in"
        >
          <Icon name="plus" />
        </button>
      </div>

      <div className="divider" />

      <button
        className="btn primary"
        disabled={!hasDoc || exporting}
        onClick={onSave}
      >
        <Icon name="save" />
        {exporting ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
