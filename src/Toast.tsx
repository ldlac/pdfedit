import { useEffect } from 'react';
import { Icon } from './Icon';

interface Props {
  message: string;
  onDone: () => void;
}

export function Toast({ message, onDone }: Props) {
  useEffect(() => {
    const id = setTimeout(onDone, 2400);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className="toast" role="status">
      <Icon name="check" />
      {message}
    </div>
  );
}
