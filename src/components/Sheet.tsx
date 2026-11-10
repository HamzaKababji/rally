import { useEffect, type ReactNode } from 'react';

/** Bottom sheet with a backdrop. Closes on backdrop tap or Escape. */
export function Sheet({
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
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="sheet-in relative max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-t-[28px] border-2 border-b-0 border-ink bg-paper px-safe pb-safe">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line" />
        <div className="flex items-center justify-between pb-2 pt-3">
          <h2 className="text-xl">{title}</h2>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-6">{children}</div>
      </div>
    </div>
  );
}
