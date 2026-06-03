type IconName =
  | 'file'
  | 'text'
  | 'signature'
  | 'save'
  | 'trash'
  | 'minus'
  | 'plus'
  | 'check'
  | 'arrow'
  | 'cursor'
  | 'upload'
  | 'wand'
  | 'eye'
  | 'eye-off';

const paths: Record<IconName, JSX.Element> = {
  file: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
    </>
  ),
  text: (
    <>
      <path d="M5 4h14" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  signature: (
    <>
      <path d="M3 17c2-3 4-5 6-5s2 3 4 3 4-2 5-4" />
      <path d="M3 21h18" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  arrow: <path d="M5 12h14M13 5l7 7-7 7" />,
  cursor: (
    <>
      <path d="M5 3l5 16 2-7 7-2z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 3v14" />
      <path d="M5 10l7-7 7 7" />
      <path d="M5 21h14" />
    </>
  ),
  wand: (
    <>
      <path d="M3 21l9-9" />
      <path d="M14 4l2 2M19 7l2 2M15 10l2 2M10 15l2 2" />
      <path d="M17 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c6.5 0 10 6 10 6a17.2 17.2 0 0 1-3.2 4M6.6 6.6A17.3 17.3 0 0 0 2 12s3.5 6 10 6c1.6 0 3-.3 4.3-.8" />
      <path d="M9.5 9.5a3 3 0 0 0 4 4" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
