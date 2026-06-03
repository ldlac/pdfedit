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

export type Annotation = TextAnnotation | SignatureAnnotation;

export interface RenderedPage {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
}
