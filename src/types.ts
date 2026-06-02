export type Tool = 'text' | 'signature' | null;

export interface BaseAnnotation {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
}

export interface SignatureAnnotation extends BaseAnnotation {
  type: 'signature';
  dataUrl: string;
}

export type Annotation = TextAnnotation | SignatureAnnotation;

export interface RenderedPage {
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  scale: number;
}
