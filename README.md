# PDF Editor

A browser-based PDF editor. Open a PDF, add text and drawn signatures, optionally let the app detect fill-in fields for you, then download the edited file. Everything runs locally in the browser; no document is uploaded anywhere.

## Features

- Open a PDF via the file picker or by dragging it onto the window
- Add text annotations (font size, color, multi-line)
- Draw a signature in the modal pad and place it on any page
- Properties sidebar for editing the selected annotation
- Zoom (50% to 300%) with a page indicator that follows the scroll position
- Detect fill-in fields automatically (see below)
- Keyboard shortcuts: `Esc` cancels the active tool, `Delete` removes the selected annotation
- Save as PDF (downloads `<name>-edited.pdf`)

### Automatic field detection

Click **Detect fields** in the toolbar. Each page is scanned by three passes:

1. **AcroForm widgets**: real form fields embedded in the PDF (`Tx` and `Sig`), via `pdfjs.getAnnotations()`. Shown in blue (text) or amber (signature).
2. **Underscore lines**: items in `pdfjs.getTextContent()` that match runs of underscores ("__________"), positioned above the line so typed text sits on top of it. Shown in blue.
3. **Grid layouts**: rectangles drawn in the page's operator list are extracted (with full CTM tracking), then clustered into rows of 3 or more similarly-sized adjacent boxes. Shown in purple. Clicking a grid drops a one-character-per-box annotation rendered in Courier.

Clicking a suggestion materializes the matching annotation and removes that suggestion. The eye toggle hides all overlays without clearing them.

## Tech stack

- Vite 8 + React 18 + TypeScript
- [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) for rendering
- [pdf-lib](https://www.npmjs.com/package/pdf-lib) for writing the edited PDF
- [react-signature-canvas](https://www.npmjs.com/package/react-signature-canvas) for the signature pad

## Getting started

Requires Node 22 and pnpm 10. The repo ships a `devenv.nix` that installs both.

```sh
pnpm install
pnpm dev
```

Then open the URL printed by Vite (defaults to `http://localhost:5173`).

### Production build

```sh
pnpm build
pnpm preview
```

## Project layout

```
src/
  App.tsx                top-level state, layout, keyboard, drag-and-drop
  Toolbar.tsx            file open, tools, detect, zoom, save
  PdfPage.tsx            one PDF page + suggestion / annotation overlay
  AnnotationView.tsx     draggable text, signature, and grid annotations
  PropertiesPanel.tsx    right sidebar for the selected annotation
  SignaturePadModal.tsx  signature drawing modal
  EmptyState.tsx         drop zone shown when no PDF is loaded
  Toast.tsx              post-save confirmation pill
  Icon.tsx               inline SVG icon set
  detect.ts              field and grid detection
  export.ts              pdf-lib export pipeline
  pdfjs-setup.ts         pdfjs worker configuration
  types.ts               shared types
  styles.css             theme and component styles
```

### Coordinate model

All annotations are stored in **PDF point units** with a top-left origin. Each `PdfPage` renders at a chosen scale and applies `× scale` when positioning overlays. This keeps annotations anchored across zoom changes and makes the export math straightforward (convert top-origin y back to PDF's bottom-origin y, the rest passes through unchanged).

## Limitations

- All processing is in-memory; very large PDFs may be slow to render.
- Text annotations export as Helvetica; grid annotations export as Courier for predictable per-box centering.
- Grid detection only finds axis-aligned rectangles drawn as graphics. Rotated grids, or grids rendered as text characters like `[ ][ ][ ]`, are not detected.
- Underscore detection looks for runs of 4 or more underscore characters.
- Field detection skips read-only AcroForm widgets.

## License

Not specified.
