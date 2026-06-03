import { Icon } from './Icon';

interface Props {
  onPick: () => void;
  hover: boolean;
}

export function EmptyState({ onPick, hover }: Props) {
  return (
    <div className={`empty-state ${hover ? 'hover' : ''}`} onClick={onPick}>
      <Icon name="upload" className="icon-lg" />
      <h2>Open a PDF to start editing</h2>
      <p>Drop a file here, or click to browse. Add text and signatures, then save.</p>
    </div>
  );
}
