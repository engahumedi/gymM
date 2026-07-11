import { useEffect, type ReactNode } from 'react';
import { X, ICON } from './icons';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="font-display text-lg text-text">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted transition-colors hover:text-text" aria-label="close">
            <X {...ICON} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
