export type Tool = 'text' | 'signature' | null;

export interface BaseAnnotation {
  id: string;
  pageIndex: number;
  // All coords are in PDF point units (scale-independent).
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  text: string;
  fontSize: number; // points
  color: string; // hex
}

export interface SignatureAnnotation extends BaseAnnotation {
  type: 'signature';
  dataUrl: string;
}

export interface GridTextAnnotation extends BaseAnnotation {
  type: 'grid';
  text: string;
  fontSize: number;
  color: string;
  boxCount: number;
  boxWidth: number;
}

export interface CheckboxAnnotation extends BaseAnnotation {
  type: 'checkbox';
  checked: boolean;
  color: string;
}

export type Annotation =
  | TextAnnotation
  | SignatureAnnotation
  | GridTextAnnotation
  | CheckboxAnnotation;

export interface RenderedPage {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
}

export type SuggestionKind = 'text' | 'signature' | 'grid' | 'checkbox';
export type SuggestionSource =
  | 'widget'
  | 'underscore'
  | 'grid'
  | 'label'
  | 'checkbox';

export interface Suggestion {
  id: string;
  pageIndex: number;
  // PDF point units, origin top-left.
  x: number;
  y: number;
  width: number;
  height: number;
  kind: SuggestionKind;
  label?: string;
  source: SuggestionSource;
  boxCount?: number;
  boxWidth?: number;
}
