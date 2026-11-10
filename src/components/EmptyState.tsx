import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-10 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r="24" fill="#E6F53D" stroke="#16233D" strokeWidth="3" />
        <path d="M8 18c10 4 10 16 0 20M48 18c-10 4-10 16 0 20" fill="none" stroke="#16233D" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-lg font-extrabold tracking-tighter">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}
